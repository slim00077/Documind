/**
 * One-time helper: copies the files already stored under uploads/ (documents and org-logos) into
 * the configured S3 bucket, using the SAME keys the database already references
 * (documents/<file>, org-logos/<file>). Run it once after the data has been restored to Neon.
 *
 *   STORAGE_DRIVER=s3 S3_ENDPOINT=... S3_REGION=... S3_BUCKET=... \
 *   S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... node scripts/upload-local-files-to-storage.js [--dry-run]
 *
 * Read-only on the local files: nothing is moved or deleted. Objects that already exist in the
 * bucket are skipped, so it is safe to run again.
 */
const { readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");
require("dotenv").config({ quiet: true });

const dryRun = process.argv.includes("--dry-run");
const required = ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const TYPES = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

async function main() {
  const { S3Client, PutObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT.trim(),
    region: process.env.S3_REGION.trim(),
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID.trim(), secretAccessKey: process.env.S3_SECRET_ACCESS_KEY.trim() },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const bucket = process.env.S3_BUCKET.trim();
  const counts = { uploaded: 0, skipped: 0, failed: 0 };

  for (const folder of ["documents", "org-logos"]) {
    const dir = join(process.cwd(), "uploads", folder);
    let names = [];
    try { names = readdirSync(dir).filter((n) => statSync(join(dir, n)).isFile()); } catch { continue; }
    for (const name of names) {
      const key = `${folder}/${name}`;
      try {
        let exists = true;
        try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); } catch (e) { if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") exists = false; else throw e; }
        if (exists) { counts.skipped++; console.log(`skip    ${key}`); continue; }
        if (dryRun) { console.log(`would upload ${key}`); counts.uploaded++; continue; }
        const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: readFileSync(join(dir, name)), ContentType: TYPES[ext] }));
        counts.uploaded++;
        console.log(`uploaded ${key}`);
      } catch (error) {
        counts.failed++;
        console.error(`FAILED  ${key}: ${error.name || "error"} ${error.message}`);
      }
    }
  }
  console.log(`${dryRun ? "[dry run] " : ""}done: ${counts.uploaded} uploaded, ${counts.skipped} already present, ${counts.failed} failed`);
  process.exit(counts.failed ? 1 : 0);
}

main().catch((error) => { console.error(error.message); process.exit(1); });
