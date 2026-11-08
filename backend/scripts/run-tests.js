/**
 * Integration test runner. Never touches the development database: it derives a
 * dedicated `<db>_test` database from DATABASE_URL, recreates it, applies every
 * migration from scratch (which also proves the migration chain), then runs
 * test/*.test.ts with node:test against it.
 */
require("dotenv").config({ quiet: true });
const { spawnSync } = require("node:child_process");
const { Pool } = require("pg");

async function main() {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is not set");
  const url = new URL(base);
  const devName = url.pathname.slice(1);
  const testName = `${devName.replace(/_test$/, "")}_test`;
  if (testName === devName) throw new Error("Refusing to run: database name already ends in _test");

  const admin = new URL(base);
  admin.pathname = "/postgres";
  const pool = new Pool({ connectionString: admin.toString() });
  await pool.query(`DROP DATABASE IF EXISTS "${testName}" WITH (FORCE)`);
  await pool.query(`CREATE DATABASE "${testName}"`);
  await pool.end();

  url.pathname = `/${testName}`;
  const testUrl = url.toString();
  const env = { ...process.env, DATABASE_URL: testUrl, JWT_SECRET: process.env.JWT_SECRET || "test-secret", NODE_ENV: "test" };

  const extPool = new Pool({ connectionString: testUrl });
  await extPool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await extPool.end();

  const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", env, shell: true });
  let result = run("npx", ["prisma", "migrate", "deploy"]);
  if (result.status !== 0) process.exit(result.status ?? 1);

  // `--coverage` (CI / SonarQube): also writes an LCOV report of src/ to coverage/lcov.info.
  const coverage = process.argv.includes("--coverage");
  const files = process.argv.slice(2).filter((arg) => arg !== "--coverage");
  if (coverage) require("node:fs").mkdirSync("coverage", { recursive: true });
  const coverageArgs = coverage
    ? ["--enable-source-maps", "--experimental-test-coverage", '"--test-coverage-include=src/**/*.ts"',
       "--test-reporter=spec", "--test-reporter-destination=stdout",
       "--test-reporter=lcov", "--test-reporter-destination=coverage/lcov.info"]
    : [];
  result = run("node", ["--test", "--test-concurrency=1", ...coverageArgs, "--require", "ts-node/register/transpile-only", ...(files.length ? files : ["test/organizations.test.ts"])]);
  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
