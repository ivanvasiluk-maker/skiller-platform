import path from "node:path";

export const TEST_DATABASE_NAME = "skiller-d1-test";
export const TEST_DATABASE_ID = "00000000-0000-4000-8000-000000000041";

export function assertTestD1({ environment, configPath, databaseName, databaseId, persistPath }) {
  if (environment !== "test") {
    throw new Error("D1 seed/reset refused: SKILLER_ENV must be exactly 'test'.");
  }
  if (path.basename(configPath) !== "wrangler.test.jsonc") {
    throw new Error("D1 seed/reset refused: only wrangler.test.jsonc is allowed.");
  }
  if (databaseName !== TEST_DATABASE_NAME || databaseId !== TEST_DATABASE_ID) {
    throw new Error("D1 seed/reset refused: the configured database is not the isolated test D1.");
  }
  if (!path.resolve(persistPath).includes(`${path.sep}skiller-d1-`)) {
    throw new Error("D1 seed/reset refused: persist path is not test-scoped.");
  }
}
