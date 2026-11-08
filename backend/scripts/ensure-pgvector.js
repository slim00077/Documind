/**
 * Runs before `prisma migrate deploy` in every environment (Render pre-deploy, Kubernetes init
 * container, docker compose). The migrations use the `vector` type but never create the
 * extension, so a fresh database would fail at the embeddings migration. Idempotent and
 * non-destructive: it only creates the extension when it is missing.
 */
require("dotenv").config({ quiet: true });
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    const { rows } = await pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    console.log(`pgvector extension ready (version ${rows[0]?.extversion ?? "unknown"})`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`pgvector check failed: ${error.message}`);
  process.exit(1);
});
