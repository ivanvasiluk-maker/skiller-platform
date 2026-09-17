import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTestD1,
  TEST_DATABASE_ID,
  TEST_DATABASE_NAME,
} from "./d1-test-guard.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const configPath = path.join(projectRoot, "wrangler.test.jsonc");
const wranglerPath = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const database = config.d1_databases?.find((item) => item.binding === "DB");

if (!database) throw new Error("Test D1 binding DB is missing.");

let guardRejected = false;
try {
  assertTestD1({
    environment: "production",
    configPath,
    databaseName: database.database_name,
    databaseId: database.database_id,
    persistPath: path.join(tmpdir(), "skiller-d1-guard-probe"),
  });
} catch {
  guardRejected = true;
}
if (!guardRejected) throw new Error("Test guard accepted a non-test environment.");

if (database.database_name !== TEST_DATABASE_NAME || database.database_id !== TEST_DATABASE_ID) {
  throw new Error("wrangler.test.jsonc must use the fixed local-only test identity.");
}

const persistPath = mkdtempSync(path.join(tmpdir(), "skiller-d1-smoke-"));
assertTestD1({
  environment: "test",
  configPath,
  databaseName: database.database_name,
  databaseId: database.database_id,
  persistPath,
});

const baseArgs = ["--config", configPath, "--local", "--persist-to", persistPath];
const run = (args, capture = false) => execFileSync(process.execPath, [wranglerPath, ...args], {
  cwd: projectRoot,
  encoding: "utf8",
  stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  env: {
    ...process.env,
    SKILLER_ENV: "test",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_WRITE_LOGS: "false",
  },
});

const query = (sql) => {
  const output = run(["d1", "execute", TEST_DATABASE_NAME, ...baseArgs, "--command", sql, "--json"], true);
  const parsed = JSON.parse(output);
  return parsed[0]?.results ?? [];
};

const requiredTables = [
  "delayed_outcomes",
  "onboarding_profiles",
  "outcomes",
  "personal_skill_evidence",
  "psychologist_access",
  "situations",
  "skill_attempts",
  "skills",
  "users",
];

try {
  run(["d1", "migrations", "apply", TEST_DATABASE_NAME, ...baseArgs]);

  const tableRows = query("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;");
  const tables = new Set(tableRows.map((row) => row.name));
  const missing = requiredTables.filter((name) => !tables.has(name));
  if (missing.length) throw new Error(`Missing migrated tables: ${missing.join(", ")}`);

  const situationColumns = new Set(
    query("PRAGMA table_info(situations);").map((row) => row.name),
  );
  const missingDecisionColumns = ["decision_reason_code", "decision_version"]
    .filter((name) => !situationColumns.has(name));
  if (missingDecisionColumns.length) {
    throw new Error(`Missing decision columns: ${missingDecisionColumns.join(", ")}`);
  }

  query("INSERT INTO users (id,email,display_name) VALUES ('d1-smoke-user','smoke@example.invalid','D1 Smoke');");
  const userRows = query("SELECT id,display_name FROM users WHERE id='d1-smoke-user';");
  if (userRows.length !== 1 || userRows[0].display_name !== "D1 Smoke") {
    throw new Error("D1 smoke record could not be read back.");
  }

  // Миграции применяются повторно без ошибок (идемпотентность на той же базе).
  run(["d1", "migrations", "apply", TEST_DATABASE_NAME, ...baseArgs]);
  const reapplyRows = query("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;");
  if (reapplyRows.length !== tableRows.length) {
    throw new Error(`Migration reapply changed table count: ${tableRows.length} → ${reapplyRows.length}`);
  }

  // Rollback-сценарий: точечный DELETE удаляет запись, schema не повреждена.
  query("DELETE FROM users WHERE id='d1-smoke-user';");
  const afterDelete = query("SELECT id FROM users WHERE id='d1-smoke-user';");
  if (afterDelete.length !== 0) throw new Error("Rollback delete did not remove the smoke record.");
  const schemaIntact = query("SELECT name FROM sqlite_schema WHERE type='table' AND name='users';");
  if (schemaIntact.length !== 1) throw new Error("Schema damaged after rollback probe.");

  console.log(`D1 smoke passed: ${requiredTables.length} tables migrated; decision audit columns present; isolated write/read succeeded; migration reapply idempotent; rollback probe clean; non-test guard rejected.`);
} finally {
  rmSync(persistPath, { recursive: true, force: true });
}
