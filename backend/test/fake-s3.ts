import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal in-process S3 (path-style) used to test the storage layer with the REAL AWS SDK and
 * no network: PutObject, GetObject, HeadObject, DeleteObject, CopyObject, ListObjectsV2.
 * It records whether every request carried a SigV4 Authorization header.
 */
export class FakeS3 {
  readonly objects = new Map<string, Buffer>(); // "<bucket>/<key>"
  readonly requests: { method: string; path: string; signed: boolean }[] = [];
  private server!: Server;
  endpoint = "";

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.endpoint = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  keys(bucket: string): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(`${bucket}/`)).map((k) => k.slice(bucket.length + 1));
  }

  private async handle(req: IncomingMessage, res: import("node:http").ServerResponse) {
    const url = new URL(req.url ?? "/", this.endpoint);
    const path = decodeURIComponent(url.pathname).replace(/^\//, "");
    this.requests.push({
      method: req.method ?? "",
      path,
      signed: String(req.headers.authorization ?? "").startsWith("AWS4-HMAC-SHA256"),
    });

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);

    const notFound = () => {
      res.writeHead(404, { "content-type": "application/xml" });
      res.end('<?xml version="1.0"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>');
    };

    switch (req.method) {
      case "PUT": {
        const copySource = req.headers["x-amz-copy-source"];
        if (typeof copySource === "string") {
          const source = this.objects.get(decodeURIComponent(copySource).replace(/^\//, ""));
          if (!source) return notFound();
          this.objects.set(path, Buffer.from(source));
          res.writeHead(200, { "content-type": "application/xml" });
          return void res.end('<?xml version="1.0"?><CopyObjectResult><ETag>"copy"</ETag><LastModified>2026-01-01T00:00:00.000Z</LastModified></CopyObjectResult>');
        }
        this.objects.set(path, body);
        res.writeHead(200, { etag: '"fake"' });
        return void res.end();
      }
      case "GET": {
        if (url.searchParams.get("list-type") === "2") {
          const bucket = path.split("/")[0];
          const contents = this.keys(bucket).slice(0, 1).map((k) => `<Contents><Key>${k}</Key></Contents>`).join("");
          res.writeHead(200, { "content-type": "application/xml" });
          return void res.end(`<?xml version="1.0"?><ListBucketResult><Name>${bucket}</Name><KeyCount>1</KeyCount><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`);
        }
        const object = this.objects.get(path);
        if (!object) return notFound();
        res.writeHead(200, { "content-length": object.length, "content-type": "application/octet-stream" });
        return void res.end(object);
      }
      case "HEAD": {
        const object = this.objects.get(path);
        res.writeHead(object ? 200 : 404, object ? { "content-length": object.length } : {});
        return void res.end();
      }
      case "DELETE":
        this.objects.delete(path);
        res.writeHead(204);
        return void res.end();
      default:
        res.writeHead(405);
        return void res.end();
    }
  }
}
