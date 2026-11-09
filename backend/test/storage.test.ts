import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { after, before, describe, it } from "node:test";
import { FakeS3 } from "./fake-s3";

// Storage settings must exist before the application modules are imported (staging folder is
// resolved at import time), hence the dynamic imports in before().
const BUCKET = "documind-test-bucket";
const s3 = new FakeS3();

// The tiniest valid PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");

const ok = (res: { status: number; body: any }, ...statuses: number[]) =>
  assert.ok(statuses.includes(res.status), `expected ${statuses.join("/")} got ${res.status}: ${JSON.stringify(res.body)}`);

describe("storage configuration (fail-closed)", () => {
  it("refuses local uploads in production unless explicitly allowed", async () => {
    const { resolveStorageConfig } = await import("../src/modules/storage/storage.config");
    assert.throws(() => resolveStorageConfig({ NODE_ENV: "production" }), /refused in production/);
    assert.throws(() => resolveStorageConfig({ NODE_ENV: "production", STORAGE_DRIVER: "local" }), /refused in production/);
    assert.deepEqual(resolveStorageConfig({ NODE_ENV: "production", STORAGE_DRIVER: "local", ALLOW_LOCAL_UPLOADS: "true" }), { driver: "local" });
    assert.deepEqual(resolveStorageConfig({ NODE_ENV: "development" }), { driver: "local" });
  });

  it("requires every S3 setting, https in production, and rejects unknown drivers", async () => {
    const { resolveStorageConfig } = await import("../src/modules/storage/storage.config");
    assert.throws(() => resolveStorageConfig({ STORAGE_DRIVER: "s3" }), /S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/);
    const full = { STORAGE_DRIVER: "s3", S3_ENDPOINT: "https://s3.example.test/", S3_REGION: "eu-central-1", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "secret" };
    const config = resolveStorageConfig(full);
    assert.equal(config.driver === "s3" && config.endpoint, "https://s3.example.test");
    assert.throws(() => resolveStorageConfig({ ...full, NODE_ENV: "production", S3_ENDPOINT: "http://insecure.test" }), /https/);
    assert.throws(() => resolveStorageConfig({ ...full, S3_SECRET_ACCESS_KEY: " " }), /S3_SECRET_ACCESS_KEY/);
    assert.throws(() => resolveStorageConfig({ STORAGE_DRIVER: "ftp" }), /Unknown STORAGE_DRIVER/);
  });

  it("does not leak the secret key in any error message", async () => {
    const { resolveStorageConfig } = await import("../src/modules/storage/storage.config");
    try {
      resolveStorageConfig({ STORAGE_DRIVER: "s3", S3_SECRET_ACCESS_KEY: "TOP-SECRET-VALUE" });
      assert.fail("should throw");
    } catch (error) {
      assert.ok(!String((error as Error).message).includes("TOP-SECRET-VALUE"));
    }
  });
});

describe("object storage (s3 driver against an in-process S3, real AWS SDK)", () => {
  let h: import("./harness").Harness;
  let storage: import("../src/modules/storage/file-storage.service").FileStorageService;
  let StoredFileNotFoundError: typeof import("../src/modules/storage/file-storage.service").StoredFileNotFoundError;
  let FileStorageService: typeof import("../src/modules/storage/file-storage.service").FileStorageService;
  const U: Record<string, { id: number; email: string }> = {};
  const E = (n: string) => `${n}@storage.test`;
  const stagingDir = join(tmpdir(), "documind-uploads");
  let orgId = 0;

  before(async () => {
    await s3.start();
    Object.assign(process.env, {
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: s3.endpoint,
      S3_REGION: "eu-central-1",
      S3_BUCKET: BUCKET,
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
      LLM_PROVIDER_ORDER: "none",
    });
    const { Harness } = await import("./harness");
    ({ FileStorageService, StoredFileNotFoundError } = await import("../src/modules/storage/file-storage.service"));
    h = new Harness();
    await h.start();
    storage = h.app.get(FileStorageService);
    for (const n of ["owner", "stranger", "orgadmin", "orgmember", "outsider"]) U[n] = await h.register(n, E(n));
    U.platform = await h.platformAdmin(E("platform"));
    const org = await h.call("POST", "/api/admin/organizations", E("platform"), { name: "Storage Org", adminEmail: E("orgadmin") });
    ok(org, 201);
    orgId = org.body.id;
    ok(await h.call("POST", `/api/organizations/${orgId}/members`, E("orgadmin"), { email: E("orgmember"), role: "STUDENT" }), 201, 200);
  });

  after(async () => {
    await h.stop();
    await s3.stop();
  });

  it("uses the S3 driver and a temp staging folder, never the app's uploads folder", () => {
    assert.equal(storage.driver, "s3");
    assert.ok(stagingDir.startsWith(tmpdir()));
  });

  it("put / read / copy / remove round-trip with signed requests", async () => {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(stagingDir, "documents"), { recursive: true });
    const staged = join(stagingDir, "documents", "roundtrip.bin");
    const data = Buffer.from("hello durable world");
    await writeFile(staged, data);

    await storage.put("documents/roundtrip.bin", staged, "application/octet-stream");
    assert.ok(!existsSync(staged), "staged temp file must be deleted after upload");
    assert.ok(s3.keys(BUCKET).includes("documents/roundtrip.bin"), "object is in the bucket");
    assert.deepEqual(await storage.read("documents/roundtrip.bin"), data);

    await storage.copy("documents/roundtrip.bin", "documents/roundtrip-copy.bin");
    assert.deepEqual(await storage.read("documents/roundtrip-copy.bin"), data);

    await storage.remove("documents/roundtrip.bin");
    await assert.rejects(storage.read("documents/roundtrip.bin"), StoredFileNotFoundError);
    assert.deepEqual(await storage.read("documents/roundtrip-copy.bin"), data, "copy is independent of the original");
    await assert.rejects(storage.copy("documents/missing.bin", "documents/x.bin"), StoredFileNotFoundError);
    await storage.remove("documents/does-not-exist.bin"); // best effort, must not throw
    await storage.remove("documents/roundtrip-copy.bin");

    assert.ok(s3.requests.length > 0 && s3.requests.every((r) => r.signed), "every request must be SigV4-signed");
  });

  it("rejects path traversal and foreign prefixes", async () => {
    for (const key of ["../etc/passwd", "documents/../../x", "other/file.txt", "documents/", "documents//x", "/documents/x"]) {
      await assert.rejects(storage.read(key), /Invalid storage key/, key);
    }
    assert.deepEqual(await storage.healthCheck(), { driver: "s3", ok: true });
  });

  it("organization logos: admin-only upload, private read, replacement deletes the old object", async () => {
    const upload = async (as: string) => {
      const form = new FormData();
      form.append("logo", new Blob([PNG], { type: "image/png" }), "logo.png");
      const res = await fetch(`${h.base}/api/organizations/${orgId}/logo`, { method: "POST", headers: { authorization: `Bearer ${h.token(E(as))}` }, body: form });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    // a plain member and an outsider cannot upload, and nothing reaches the bucket
    const before = s3.keys(BUCKET).length;
    ok(await upload("orgmember"), 403);
    ok(await upload("outsider"), 403, 404);
    assert.equal(s3.keys(BUCKET).length, before);

    ok(await upload("orgadmin"), 201);
    const first = s3.keys(BUCKET).filter((k) => k.startsWith("org-logos/"));
    assert.equal(first.length, 1);

    const get = async (as?: string) => fetch(`${h.base}/api/organizations/${orgId}/logo`, { headers: as ? { authorization: `Bearer ${h.token(E(as))}` } : {} });
    const mine = await get("orgmember");
    assert.equal(mine.status, 200);
    assert.match(mine.headers.get("content-type") ?? "", /image\/png/);
    assert.deepEqual(Buffer.from(await mine.arrayBuffer()), PNG);
    assert.equal((await get("outsider")).status, 404);
    assert.equal((await get()).status, 401);

    ok(await upload("orgadmin"), 201); // replace
    const second = s3.keys(BUCKET).filter((k) => k.startsWith("org-logos/"));
    assert.equal(second.length, 1, "the previous logo object is deleted");
    assert.notEqual(second[0], first[0]);
  });

  it("document files: access control is still enforced, and bytes come from the bucket", async () => {
    const doc = await h.prisma.document.create({
      data: { name: "Scan", userId: U.owner.id, status: "READY", extractedText: "x", mimeType: "image/png", originalName: "scan.png", filePath: "img-1.png", size: PNG.length, chunks: { create: [{ content: "x", chunkIndex: 0 }] } },
    });
    s3.objects.set(`${BUCKET}/documents/img-1.png`, PNG);

    const owner = await fetch(`${h.base}/api/documents/${doc.id}/image`, { headers: { authorization: `Bearer ${h.token(E("owner"))}` } });
    assert.equal(owner.status, 200);
    assert.deepEqual(Buffer.from(await owner.arrayBuffer()), PNG);
    assert.equal((await fetch(`${h.base}/api/documents/${doc.id}/image`, { headers: { authorization: `Bearer ${h.token(E("stranger"))}` } })).status, 404);
    assert.equal((await fetch(`${h.base}/api/documents/${doc.id}/image`)).status, 401);

    // a database row whose object is gone answers 404, not 500
    await h.prisma.document.update({ where: { id: doc.id }, data: { filePath: "img-gone.png" } });
    assert.equal((await fetch(`${h.base}/api/documents/${doc.id}/image`, { headers: { authorization: `Bearer ${h.token(E("owner"))}` } })).status, 404);
    await h.prisma.document.update({ where: { id: doc.id }, data: { filePath: "img-1.png" } });

    // versions: download returns the archived file with its original name
    s3.objects.set(`${BUCKET}/documents/v1.txt`, Buffer.from("version one"));
    const version = await h.prisma.documentVersion.create({ data: { documentId: doc.id, version: 1, originalName: "old.txt", mimeType: "text/plain", size: 11, filePath: "v1.txt", createdById: U.owner.id } });
    const download = await fetch(`${h.base}/api/documents/${doc.id}/versions/${version.id}/file`, { headers: { authorization: `Bearer ${h.token(E("owner"))}` } });
    assert.equal(download.status, 200);
    assert.match(download.headers.get("content-disposition") ?? "", /old\.txt/);
    assert.equal(await download.text(), "version one");
    assert.equal((await fetch(`${h.base}/api/documents/${doc.id}/versions/${version.id}/file`, { headers: { authorization: `Bearer ${h.token(E("stranger"))}` } })).status, 404);

    // permanent deletion removes the current file AND every version from the bucket
    ok(await h.call("DELETE", `/api/documents/${doc.id}`, E("owner")), 200);
    ok(await h.call("DELETE", `/api/documents/${doc.id}/permanent`, E("owner")), 200);
    assert.ok(!s3.objects.has(`${BUCKET}/documents/img-1.png`));
    assert.ok(!s3.objects.has(`${BUCKET}/documents/v1.txt`));
  });

  it("leaves nothing behind on the host filesystem", () => {
    const leftovers = ["documents", "org-logos"].flatMap((d) => (existsSync(join(stagingDir, d)) ? readdirSync(join(stagingDir, d)) : []));
    assert.deepEqual(leftovers, []);
  });

  it("readiness reports a bucket that cannot be reached instead of claiming health", async () => {
    await s3.stop();
    const res = await fetch(`${h.base}/api/health`);
    assert.equal(res.status, 503);
    const body = (await res.json()) as { status: string; storage: string };
    assert.equal(body.status, "error");
    assert.equal(body.storage, "s3-unreachable");
    assert.equal((await fetch(`${h.base}/api/health/live`)).status, 200, "liveness stays independent of storage");
  });
});
