import { Injectable, Logger } from "@nestjs/common";
import type { S3Client } from "@aws-sdk/client-s3";
import { copyFile, mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { resolveStorageConfig, UPLOAD_STAGING_ROOT, type StorageConfig } from "./storage.config";

export class StoredFileNotFoundError extends Error {
  constructor(key: string) {
    super(`Stored file not found: ${key}`);
    this.name = "StoredFileNotFoundError";
  }
}

const KEY_PATTERN = /^(documents|org-logos)\/[A-Za-z0-9][\w.-]{0,200}$/;

/**
 * Durable storage for uploaded documents and organization logos.
 *
 * Keys are `documents/<file>` and `org-logos/<file>`, i.e. the same layout as the historical
 * `uploads/` folder, so the `filePath` values already stored in the database keep working.
 * Authorization is NOT handled here: callers load the document/organization through the existing
 * access-control checks first and only then ask for the file.
 */
@Injectable()
export class FileStorageService {
  readonly config: StorageConfig = resolveStorageConfig();
  private readonly logger = new Logger(FileStorageService.name);
  private client?: Promise<S3Client>;

  get driver(): "local" | "s3" {
    return this.config.driver;
  }

  static assertKey(key: string): string {
    if (!KEY_PATTERN.test(key) || key.includes("..")) {
      throw new Error("Invalid storage key");
    }
    return key;
  }

  /** Stores a file that multer already wrote to the staging folder. */
  async put(key: string, stagedPath: string, contentType?: string): Promise<void> {
    FileStorageService.assertKey(key);

    if (this.config.driver === "local") {
      const target = this.localPath(key);
      if (resolve(stagedPath) !== target) {
        await mkdir(dirname(target), { recursive: true });
        await copyFile(stagedPath, target);
      }
      return;
    }

    const body = await readFile(stagedPath);
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await this.s3()).send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentLength: body.length,
        ContentType: contentType,
      }),
    );
    // The bucket is the only permanent copy; never leave uploads on the host filesystem.
    await unlink(stagedPath).catch(() => undefined);
  }

  async read(key: string): Promise<Buffer> {
    FileStorageService.assertKey(key);

    if (this.config.driver === "local") {
      try {
        return await readFile(this.localPath(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StoredFileNotFoundError(key);
        throw error;
      }
    }

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      const response = await (await this.s3()).send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return Buffer.from(await response.Body!.transformToByteArray());
    } catch (error) {
      if (this.isNotFound(error)) throw new StoredFileNotFoundError(key);
      throw error;
    }
  }

  /** Best effort, like the previous unlink(): an already-missing file must not fail the request. */
  async remove(key: string): Promise<void> {
    try {
      FileStorageService.assertKey(key);
      if (this.config.driver === "local") {
        await unlink(this.localPath(key));
        return;
      }
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await this.s3()).send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      this.logger.warn(`Could not delete stored file ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Independent copy (version restore): deleting either file never affects the other. */
  async copy(sourceKey: string, targetKey: string): Promise<void> {
    FileStorageService.assertKey(sourceKey);
    FileStorageService.assertKey(targetKey);

    if (this.config.driver === "local") {
      try {
        await copyFile(this.localPath(sourceKey), this.localPath(targetKey));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StoredFileNotFoundError(sourceKey);
        throw error;
      }
      return;
    }

    const { CopyObjectCommand } = await import("@aws-sdk/client-s3");
    try {
      await (await this.s3()).send(
        new CopyObjectCommand({
          Bucket: this.config.bucket,
          Key: targetKey,
          CopySource: `${this.config.bucket}/${sourceKey}`,
        }),
      );
    } catch (error) {
      if (this.isNotFound(error)) throw new StoredFileNotFoundError(sourceKey);
      throw error;
    }
  }

  /** Readiness probe: can the configured store actually be reached with the configured credentials? */
  async healthCheck(): Promise<{ driver: "local" | "s3"; ok: boolean }> {
    try {
      if (this.config.driver === "local") {
        await mkdir(UPLOAD_STAGING_ROOT, { recursive: true });
        return { driver: "local", ok: true };
      }
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      await (await this.s3()).send(
        new ListObjectsV2Command({ Bucket: this.config.bucket, MaxKeys: 1 }),
        { abortSignal: AbortSignal.timeout(5000) },
      );
      return { driver: "s3", ok: true };
    } catch (error) {
      this.logger.warn(`Storage health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return { driver: this.config.driver, ok: false };
    }
  }

  private localPath(key: string): string {
    const root = resolve(UPLOAD_STAGING_ROOT);
    const path = resolve(root, key);
    if (!path.startsWith(root + sep)) throw new Error("Invalid storage key");
    return path;
  }

  private isNotFound(error: unknown): boolean {
    const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
  }

  private s3(): Promise<S3Client> {
    if (this.config.driver !== "s3") throw new Error("S3 client requested with the local storage driver");
    const config = this.config;
    this.client ??= import("@aws-sdk/client-s3").then(
      ({ S3Client }) =>
        new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          forcePathStyle: true, // Neon Object Storage: path-style addressing only
          credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
          maxAttempts: 3,
          // S3-compatible services do not all implement the newer default CRC checksums.
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED",
        }),
    );
    return this.client;
  }
}
