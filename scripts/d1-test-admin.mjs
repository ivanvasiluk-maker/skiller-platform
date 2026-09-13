import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertTestD1, TEST_DATABASE_NAME } from "./d1-test-guard.mjs";

const operation = process.argv[2];
if (!["seed", "reset"].includes(operation)) {
  throw new Error("Usage: SKILLER_ENV=test node scripts/d1-test-admin.mjs <seed|reset>");
}

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const configPath = path.join(projectRoot, "wrangler.test.jsonc");
const persistPath = path.join(projectRoot, ".wrangler", "skiller-d1-test");
const wranglerPath = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const database = config.d1_databases?.find((item) => item.binding === "DB");
if (!database) throw new Error("Test D1 binding DB is missing.");

assertTestD1({
  environment: process.env.SKILLER_ENV,
  configPath,
  databaseName: database.database_name,
  databaseId: database.database_id,
  persistPath,
});

if (operation === "reset") rmSync(persistPath, { recursive: true, force: true });
mkdirSync(persistPath, { recursive: true });

const baseArgs = ["--config", configPath, "--local", "--persist-to", persistPath];
const run = (args) => execFileSync(process.execPath, [wranglerPath, ...args], {
  cwd: projectRoot,
  stdio: "inherit",
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false" },
});

run(["d1", "migrations", "apply", TEST_DATABASE_NAME, ...baseArgs]);
if (operation === "seed") {
  run(["d1", "execute", TEST_DATABASE_NAME, ...baseArgs, "--command", "INSERT OR IGNORE INTO users (id,email,display_name) VALUES ('local-test-user','local-test@example.invalid','Local Test User');"]);
}

console.log(`Test D1 ${operation} completed at ${path.relative(projectRoot, persistPath)}.`);
