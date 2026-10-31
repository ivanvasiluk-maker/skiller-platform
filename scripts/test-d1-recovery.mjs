// Recovery rehearsal on two disposable local databases, never a production backup.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTestD1, TEST_DATABASE_ID, TEST_DATABASE_NAME } from './d1-test-guard.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const configPath = path.join(root, 'wrangler.test.jsonc');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const database = config.d1_databases?.find(item => item.binding === 'DB');
assert.ok(database, 'Test D1 binding is required');
const temporary = mkdtempSync(path.join(tmpdir(), 'skiller-d1-recovery-'));
const source = path.join(temporary, 'source', '.wrangler', 'state');
const restored = path.join(temporary, 'restored', '.wrangler', 'state');
const snapshot = path.join(temporary, 'snapshot.sql');
const environment = { ...process.env, SKILLER_ENV: 'test', SKILLER_AI_DISABLED: '1', OPENAI_API_KEY: '',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' };
for (const persistPath of [source, restored]) assertTestD1({ environment: environment.SKILLER_ENV, configPath,
  databaseName: database.database_name, databaseId: database.database_id, persistPath });
assert.equal(database.database_id, TEST_DATABASE_ID);
for (const persistPath of [source, restored]) {
  const directory = path.resolve(persistPath, '../..');
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, 'wrangler.test.jsonc'), JSON.stringify({ ...config,
    main: path.join(root, config.main), d1_databases: [{ ...database, migrations_dir: path.join(root, 'drizzle') }] }));
}
function run(persistPath, args) {
  const localConfig = path.resolve(persistPath, '../..', 'wrangler.test.jsonc');
  return execFileSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
    'd1', ...args, '--config', localConfig, '--local', ...(args[0] === 'export' ? [] : ['--persist-to', persistPath])],
  { cwd: root, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function query(persistPath, sql) {
  const result = JSON.parse(run(persistPath, ['execute', TEST_DATABASE_NAME, '--command', sql, '--json']));
  return result.flatMap(item => item.results ?? []);
}
function inventory(persistPath) {
  const tables = query(persistPath, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name");
  for (const { name } of tables) assert.match(name, /^[a-zA-Z0-9_]+$/);
  const sql = tables.flatMap(({ name }) => [`PRAGMA table_info("${name}")`, `SELECT * FROM "${name}" ORDER BY rowid`]).join(';');
  const results = JSON.parse(run(persistPath, ['execute', TEST_DATABASE_NAME, '--command', sql, '--json']));
  assert.equal(results.length, tables.length * 2);
  return tables.map(({ name }, i) => ({ name, columns: results[i * 2].results, rows: results[i * 2 + 1].results }));
}
try {
  run(source, ['migrations', 'apply', TEST_DATABASE_NAME]);
  query(source, "INSERT INTO users (id,email,display_name) VALUES ('restore-a','a@example.invalid','A'),('restore-b','b@example.invalid','B')");
  query(source, "INSERT INTO behavioral_memory_v2 (id,user_id,analysis_id,kind,action_urge,topic,intervention_point,created_at) VALUES ('restore-memory','restore-b','restore-analysis','task','avoid','synthetic','start','2026-10-31')");
  query(source, "INSERT INTO day_tasks (id,user_id,task_date,timezone,title,title_key,status,created_at,updated_at) VALUES ('restore-task','restore-b','2026-11-01','UTC','Synthetic restore task','synthetic restore task','partial','2026-10-31','2026-10-31'); INSERT INTO reminder_preferences (user_id,enabled,updated_at) VALUES ('restore-b',1,'2026-10-31'); INSERT INTO reminders (id,user_id,task_id,timezone,local_time,due_at,created_at,updated_at) VALUES ('restore-reminder','restore-b','restore-task','UTC','2026-11-01T12:00','2026-11-01T12:00:00.000Z','2026-10-31','2026-10-31')");
  query(source, "INSERT INTO privacy_requests (id,user_id,status,created_at) VALUES ('restore-erasure','restore-a','requested','2026-10-31')");
  const before = inventory(source);
  run(source, ['export', TEST_DATABASE_NAME, '--output', snapshot]);
  assert.ok(statSync(snapshot).size > 0, 'Snapshot must contain bytes');
  query(source, "DELETE FROM behavioral_memory_v2 WHERE id='restore-memory'");
  assert.equal(query(source, "SELECT id FROM behavioral_memory_v2 WHERE id='restore-memory'").length, 0);
  run(restored, ['execute', TEST_DATABASE_NAME, '--file', snapshot]);
  assert.deepEqual(inventory(restored), before, 'Restored schema, migration ledger and all rows must match the snapshot');
  assert.equal(query(restored, "SELECT status FROM privacy_requests WHERE user_id='restore-a'")[0]?.status, 'requested', 'Erasure request must survive restore');
  assert.equal(query(restored, "SELECT user_id FROM behavioral_memory_v2 WHERE id='restore-memory'")[0]?.user_id, 'restore-b');
  run(restored, ['migrations', 'apply', TEST_DATABASE_NAME]);
  assert.deepEqual(inventory(restored), before, 'Migration reapply after restore must not modify the snapshot');
  console.log('D1 recovery PASS: isolated snapshot/export/restore, schema and all rows including migration ledger, retained memory and erasure request, idempotent migrations.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
