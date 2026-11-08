/**
 * Fail-closed safety guard shared by scripts/run-tests.js (before it DROPs/CREATEs a database)
 * and test/harness.ts (before the app starts). It validates the parsed database NAME, never the
 * raw URL string: connection strings may carry a query (`?schema=public`) or credentials.
 *
 * Accepted: a name made only of [a-z0-9_] that ends in `_test` and is not a protected name.
 * Anything else - unparsable URL, empty name, odd characters, protected/production-like name -
 * is rejected. Error messages contain the database name only, never credentials.
 */
const PROTECTED_NAMES = new Set(["documind", "postgres", "template0", "template1"]);
const PRODUCTION_LIKE = /(prod|staging|live|primary|master)/i;

function databaseNameOf(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("Refusing to run tests: DATABASE_URL is missing or not a valid URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Refusing to run tests: DATABASE_URL is not a PostgreSQL URL");
  }
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function assertTestDatabaseName(name) {
  const reject = (why) => {
    throw new Error(`Refusing to run tests against database "${name}": ${why}`);
  };
  if (!/^[a-z0-9_]+$/.test(name)) reject("name must contain only lowercase letters, digits and underscores");
  if (!name.endsWith("_test")) reject('name must end with "_test"');
  if (PROTECTED_NAMES.has(name)) reject("protected database name");
  if (PRODUCTION_LIKE.test(name)) reject("name looks like a production/staging database");
  return name;
}

/** Throws unless `connectionString` points at a dedicated test database; returns its name. */
function assertTestDatabase(connectionString) {
  return assertTestDatabaseName(databaseNameOf(connectionString));
}

module.exports = { databaseNameOf, assertTestDatabaseName, assertTestDatabase };
