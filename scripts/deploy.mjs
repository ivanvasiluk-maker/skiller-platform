// Production deploy: сборка → применение миграций → деплой worker'а.
// Защита: отказывается деплоить, если prod-конфиг не заполнен или в нём
// тестовый D1 identity. Секреты задаются отдельно через `wrangler secret put`.
//
// Порядок:
//   1. npm run deploy:check  — проверить, что конфиг заполнен
//   2. npm run deploy        — build + migrations + deploy

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const configPath = path.join(projectRoot, "wrangler.production.jsonc");
const wranglerPath = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");

const TEST_DATABASE_ID = "00000000-0000-4000-8000-000000000041";
const TEST_DATABASE_NAME = "skiller-d1-test";

function readConfig() {
  const raw = readFileSync(configPath, "utf8");
  // jsonc: убираем // комментарии перед parse.
  const stripped = raw.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped);
}

export function assertProductionConfig() {
  const config = readConfig();
  const db = config.d1_databases?.find((item) => item.binding === "DB");
  if (!db) throw new Error("wrangler.production.jsonc: нет D1 binding DB.");

  const placeholders = [];
  if (!db.database_id || db.database_id.startsWith("REPLACE_WITH")) placeholders.push("database_id");
  if (!db.database_name || db.database_name.startsWith("REPLACE_WITH")) placeholders.push("database_name");
  const spreadsheet = config.vars?.GOOGLE_SHEETS_SPREADSHEET_ID ?? "";
  if (spreadsheet.startsWith("REPLACE_WITH")) placeholders.push("GOOGLE_SHEETS_SPREADSHEET_ID");

  if (placeholders.length) {
    throw new Error(
      `wrangler.production.jsonc не заполнен: ${placeholders.join(", ")}. ` +
      "Заполните реальные значения (см. docs/DEPLOY.md) перед деплоем.",
    );
  }
  if (db.database_id === TEST_DATABASE_ID || db.database_name === TEST_DATABASE_NAME) {
    throw new Error(
      "wrangler.production.jsonc указывает на ТЕСТОВУЮ D1. " +
      "Production и test D1 должны быть физически разделены.",
    );
  }
  if (config.name === "site-creator-vinext-starter") {
    throw new Error("wrangler.production.jsonc: задайте production имя worker'а (name).");
  }
  return { database: db, config };
}

const subcommand = process.argv[2] ?? "deploy";

if (subcommand === "check") {
  const { database } = assertProductionConfig();
  console.log(
    `Production config OK: worker + D1 '${database.database_name}' (${database.database_id}). ` +
    "Секреты задаются через wrangler secret put (см. docs/DEPLOY.md).",
  );
  process.exit(0);
}

if (subcommand !== "deploy") {
  throw new Error(`Unknown subcommand '${subcommand}'. Use 'check' or 'deploy'.`);
}

const { database } = assertProductionConfig();
const run = (args, label) => {
  console.log(`\n=== ${label} ===`);
  execFileSync(process.execPath, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
};

console.log("Deploying to production D1:", database.database_name, database.database_id);
console.log("Это изменит ПРОДАКШЕН. Прерветесь — Ctrl+C. Пауза 5 секунд...");
await new Promise((resolve) => setTimeout(resolve, 5000));

run(["node_modules/vinext/dist/cli.js", "build"], "build production bundle");
run([wranglerPath, "d1", "migrations", "apply", database.database_name, "--remote", "--config", configPath], "apply D1 migrations (remote)");
run([wranglerPath, "deploy", "--config", configPath], "deploy worker");

console.log("\nDeploy complete. Проверьте smoke по docs/DEPLOY.md.");
