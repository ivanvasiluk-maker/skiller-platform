// Этап 3, задача «SQL/скрипт для D2, D3, D7 engaged retention и action completion»
// плюс сверка D1 events с экспортированными строками (reconciliation).
// Работает только против изолированной тестовой D1 (d1-test-guard).
//
// Использование:
//   node scripts/pilot-metrics.mjs            # метрики по cohorts
//   node scripts/pilot-metrics.mjs --reconcile # сверка export queue vs events

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  assertTestD1,
  TEST_DATABASE_ID,
  TEST_DATABASE_NAME,
} from "./d1-test-guard.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const configPath = path.join(projectRoot, "wrangler.test.jsonc");
const wranglerPath = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const persistPath = mkdtempSync(path.join(tmpdir(), "skiller-d1-metrics-"));

assertTestD1({
  environment: "test",
  configPath,
  databaseName: TEST_DATABASE_NAME,
  databaseId: TEST_DATABASE_ID,
  persistPath,
});

const reconcile = process.argv.includes("--reconcile");

const RETENTION_SQL = `
SELECT m.cohort_key,
       COUNT(DISTINCT m.user_id) AS users,
       COUNT(DISTINCT CASE WHEN e.day_index = 2 AND e.event_name = 'engaged_return' THEN e.user_id END) AS d2_engaged,
       COUNT(DISTINCT CASE WHEN e.day_index = 3 AND e.event_name = 'engaged_return' THEN e.user_id END) AS d3_engaged,
       COUNT(DISTINCT CASE WHEN e.day_index = 7 AND e.event_name = 'engaged_return' THEN e.user_id END) AS d7_engaged
FROM cohort_members m
LEFT JOIN pilot_events e ON e.user_id = m.user_id
GROUP BY m.cohort_key
ORDER BY m.cohort_key;`;

const COMPLETION_SQL = `
SELECT m.cohort_key,
       COUNT(DISTINCT p.id) AS actions_started,
       COUNT(DISTINCT CASE WHEN p.result IS NOT NULL THEN p.id END) AS actions_finished,
       COUNT(DISTINCT CASE WHEN p.result IN ('done','more') THEN p.id END) AS actions_completed
FROM cohort_members m
JOIN trainer_profiles tp ON tp.pseudonym = m.user_id
LEFT JOIN trainer_plans p ON p.user_id = tp.user_id AND p.attempt_id IS NOT NULL
GROUP BY m.cohort_key
ORDER BY m.cohort_key;`;

const RECONCILE_SQL = `
SELECT
  (SELECT COUNT(*) FROM pilot_events) AS d1_events,
  (SELECT COUNT(*) FROM export_queue) AS queued,
  (SELECT COUNT(*) FROM export_queue WHERE status = 'sent') AS sent,
  (SELECT COUNT(*) FROM export_queue WHERE status = 'failed' AND attempts >= 8) AS dead_lettered,
  (SELECT COUNT(*) FROM pilot_events WHERE exported_at IS NOT NULL) AS marked_exported,
  (SELECT COUNT(*) FROM pilot_events p LEFT JOIN export_queue q ON q.event_id = p.id WHERE q.id IS NULL) AS events_without_queue;`;

function runSql(sql) {
  const out = execFileSync(
    process.execPath,
    [
      wranglerPath,
      "d1",
      "execute",
      TEST_DATABASE_NAME,
      "--config",
      configPath,
      "--local",
      "--persist-to",
      persistPath,
      "--json",
      "--command",
      sql,
    ],
    { cwd: projectRoot, encoding: "utf8", env: { ...process.env, SKILLER_ENV: "test", WRANGLER_SEND_METRICS: "false" } },
  );
  const parsed = JSON.parse(out);
  return parsed.flatMap((entry) => entry.results ?? []);
}

try {
  if (reconcile) {
    const [row] = runSql(RECONCILE_SQL);
    console.log("Reconciliation D1 events ↔ export queue:");
    console.log(JSON.stringify(row, null, 2));
    const mismatch =
      Number(row.events_without_queue) > 0 ||
      Number(row.marked_exported) !== Number(row.sent);
    if (mismatch) {
      console.error("MISMATCH: каждое событие должно быть в очереди; sent должен совпадать с exported_at.");
      process.exitCode = 1;
    } else {
      console.log("OK: все события поставлены в очередь, sent = exported_at.");
    }
  } else {
    console.log("Engaged retention по cohort (D2/D3/D7):");
    console.table(runSql(RETENTION_SQL));
    console.log("Action start/completion по cohort:");
    console.table(runSql(COMPLETION_SQL));
  }
} finally {
  rmSync(persistPath, { recursive: true, force: true });
}
