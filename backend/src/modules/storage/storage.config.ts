import { tmpdir } from "node:os";
import { join } from "node:path";

export type StorageConfig =
  | { driver: "local" }
  | {
      driver: "s3";
      endpoint: string;
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
    };

const isProduction = (env: NodeJS.ProcessEnv) => env.NODE_ENV === "production";

/**
 * Resolves where uploaded files are stored. Fail-closed: anything ambiguous or incomplete throws
 * at startup instead of silently falling back to a filesystem that production hosts wipe.
 *
 *  - STORAGE_DRIVER=s3     private S3-compatible bucket (Neon Object Storage). Requires
 *                          S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.
 *  - STORAGE_DRIVER=local  <cwd>/uploads (default in development). Refused in production unless
 *                          ALLOW_LOCAL_UPLOADS=true, which is only correct with a mounted volume
 *                          (docker compose volume, Kubernetes PVC) - never on Render Free.
 */
export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const driver = (env.STORAGE_DRIVER ?? "local").trim().toLowerCase();

  if (driver === "local") {
    if (isProduction(env) && env.ALLOW_LOCAL_UPLOADS !== "true") {
      throw new Error(
        "STORAGE_DRIVER=local is refused in production: the local filesystem is not durable on most hosts. " +
          "Set STORAGE_DRIVER=s3 (and the S3_* variables), or ALLOW_LOCAL_UPLOADS=true if a persistent volume is mounted on /app/uploads.",
      );
    }
    return { driver: "local" };
  }

  if (driver !== "s3") {
    throw new Error(`Unknown STORAGE_DRIVER "${driver}" (expected "local" or "s3")`);
  }

  const required = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`STORAGE_DRIVER=s3 requires: ${missing.join(", ")}`);
  }

  const endpoint = env.S3_ENDPOINT!.trim().replace(/\/+$/, "");
  if (isProduction(env) && !endpoint.startsWith("https://")) {
    throw new Error("S3_ENDPOINT must use https:// in production");
  }

  return {
    driver: "s3",
    endpoint,
    region: env.S3_REGION!.trim(),
    bucket: env.S3_BUCKET!.trim(),
    accessKeyId: env.S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!.trim(),
  };
}

/**
 * Where multer first writes an upload. With the s3 driver this is the OS temp folder only:
 * the file is pushed to the bucket and the temp copy is deleted. With the local driver it is the
 * permanent location (unchanged behaviour).
 */
export const UPLOAD_STAGING_ROOT =
  (process.env.STORAGE_DRIVER ?? "").trim().toLowerCase() === "s3"
    ? join(tmpdir(), "documind-uploads")
    : join(process.cwd(), "uploads");
