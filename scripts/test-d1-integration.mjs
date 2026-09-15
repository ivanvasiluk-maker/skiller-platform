import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
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
const wranglerPath = path.join(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const database = config.d1_databases?.find((item) => item.binding === "DB");

if (!database) throw new Error("Test D1 binding DB is missing.");
if (
  database.database_name !== TEST_DATABASE_NAME ||
  database.database_id !== TEST_DATABASE_ID
) {
  throw new Error("wrangler.test.jsonc must use the fixed local-only test identity.");
}

const persistPath = mkdtempSync(path.join(tmpdir(), "skiller-d1-integration-"));
assertTestD1({
  environment: "test",
  configPath,
  databaseName: database.database_name,
  databaseId: database.database_id,
  persistPath,
});

const environment = {
  ...process.env,
  SKILLER_ENV: "test",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_WRITE_LOGS: "false",
};
const baseArgs = [
  "--config",
  configPath,
  "--local",
  "--persist-to",
  persistPath,
];

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local integration-test port."));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForWorker(baseUrl, getLogs, hasExited) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (hasExited()) {
      throw new Error(`D1 integration worker exited before startup.\n${getLogs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Wrangler may still be compiling or opening the local D1 database.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`D1 integration worker did not start.\n${getLogs()}`);
}

async function runScenario(baseUrl, scenario) {
  const response = await fetch(`${baseUrl}/scenario`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function runOutcomeIdempotency(baseUrl) {
  const response = await fetch(`${baseUrl}/outcome-idempotency`, {
    method: "POST",
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function runSettingsContinuity(baseUrl) {
  const response = await fetch(`${baseUrl}/settings-continuity`, {
    method: "POST",
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function runIdempotentRequest(baseUrl, requestId) {
  const response = await fetch(`${baseUrl}/idempotency`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestId }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

let worker;
let logs = "";
try {
  execFileSync(
    process.execPath,
    [
      wranglerPath,
      "d1",
      "migrations",
      "apply",
      TEST_DATABASE_NAME,
      ...baseArgs,
    ],
    { cwd: projectRoot, stdio: "inherit", env: environment },
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  worker = spawn(
    process.execPath,
    [
      wranglerPath,
      "dev",
      ...baseArgs,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      "0",
    ],
    { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] },
  );
  worker.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  worker.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  await waitForWorker(baseUrl, () => logs, () => worker.exitCode !== null);

  const firstTry = await runScenario(baseUrl, "first_try");
  assert.deepEqual(firstTry, {
    prior: null,
    evidenceContextKind: null,
    reasonCode: "first_try",
    decisionVersion: "outcome-policy-v2",
    selectedSkillId: "micro-start",
    shouldResize: false,
    storedOutcomeCount: 0,
  });

  const repeatHelpful = await runScenario(baseUrl, "repeat_helpful");
  assert.deepEqual(repeatHelpful, {
    prior: { completed: true, helpfulness: 7, avoidance: false },
    evidenceContextKind: "stuck",
    reasonCode: "repeat_helpful",
    decisionVersion: "outcome-policy-v2",
    selectedSkillId: "micro-start",
    shouldResize: false,
    storedOutcomeCount: 1,
  });

  const resizeAfterFailed = await runScenario(baseUrl, "resize_after_failed");
  assert.deepEqual(resizeAfterFailed, {
    prior: { completed: false, helpfulness: 5, avoidance: false },
    evidenceContextKind: "stuck",
    reasonCode: "resize_after_failed",
    decisionVersion: "outcome-policy-v2",
    selectedSkillId: "micro-start",
    shouldResize: true,
    storedOutcomeCount: 1,
  });

  const replaceLowFit = await runScenario(baseUrl, "replace_low_fit");
  assert.deepEqual(replaceLowFit, {
    prior: { completed: true, helpfulness: 2, avoidance: false },
    evidenceContextKind: "stuck",
    reasonCode: "replace_low_fit",
    decisionVersion: "outcome-policy-v2",
    selectedSkillId: "distract-delay",
    shouldResize: false,
    storedOutcomeCount: 1,
  });

  const avoidanceReplace = await runScenario(baseUrl, "avoidance_replace");
  assert.deepEqual(avoidanceReplace, {
    prior: { completed: true, helpfulness: 8, avoidance: true },
    evidenceContextKind: "stuck",
    reasonCode: "replace_low_fit",
    decisionVersion: "outcome-policy-v2",
    selectedSkillId: "distract-delay",
    shouldResize: false,
    storedOutcomeCount: 1,
  });

  const transferHelpful = await runScenario(baseUrl, "transfer_helpful");
  assert.deepEqual(transferHelpful, {
    prior: { completed: true, helpfulness: 7, avoidance: false },
    evidenceContextKind: "conflict",
    reasonCode: "transfer_helpful",
    decisionVersion: "outcome-policy-v2",
    selectedSkillId: "micro-start",
    shouldResize: false,
    storedOutcomeCount: 1,
  });

  const safetyOverride = await runScenario(baseUrl, "safety_override");
  assert.deepEqual(safetyOverride, {
    prior: null,
    evidenceContextKind: null,
    reasonCode: null,
    decisionVersion: "outcome-policy-v2",
    selectedSkillId: "micro-start",
    shouldResize: false,
    storedOutcomeCount: 1,
  });

  const repeatedOutcome = await runOutcomeIdempotency(baseUrl);
  assert.deepEqual(repeatedOutcome, {
    outcomeCount: 1,
    outcome: { completed: 0, helpfulness: 4, avoidance: 0 },
    attemptStatus: "attempted",
    evidence: {
      attempts: 1,
      completions: 0,
      helpfulSum: 4,
      goalSum: 0,
      avoidanceCount: 0,
    },
  });

  const settingsContinuity = await runSettingsContinuity(baseUrl);
  assert.deepEqual(settingsContinuity, {
    profile: { trainerId: "beck", interactionMode: "direct" },
    dayBefore: 4,
    dayAfter: 4,
    plan: { idPreserved: true, result: "done", helpfulness: 8 },
    outcome: { completed: 1, helpfulness: 8, avoidance: 0 },
    historicalEvent: {
      idPreserved: true,
      trainerId: "marsha",
      dayIndex: 2,
      payload: { source: "before-settings" },
    },
    changeEvents: [
      {
        trainerId: "beck",
        dayIndex: 4,
        name: "interaction_mode_changed",
        payload: {
          from_interaction_mode: "support",
          to_interaction_mode: "direct",
          final_trainer_id: "beck",
        },
      },
      {
        trainerId: "beck",
        dayIndex: 4,
        name: "trainer_changed",
        payload: {
          from_trainer_id: "marsha",
          to_trainer_id: "beck",
          final_interaction_mode: "direct",
        },
      },
    ],
  });

  const requestId = "00000000-0000-4000-8000-000000000043";
  const firstRequest = await runIdempotentRequest(baseUrl, requestId);
  const repeatedRequest = await runIdempotentRequest(baseUrl, requestId);
  assert.deepEqual(firstRequest, { requestId, mutationCount: 1 });
  assert.deepEqual(repeatedRequest, firstRequest);
  const countResponse = await fetch(
    `${baseUrl}/idempotency-count?requestId=${requestId}`,
  );
  assert.deepEqual(await countResponse.json(), { mutationCount: 1 });

  console.log(
    "D1 integration passed: seven recommendation branches including avoidance, idempotent repeated outcomes, settings continuity, and duplicate request mutation.",
  );
} finally {
  if (worker && worker.exitCode === null) worker.kill("SIGTERM");
  rmSync(persistPath, { recursive: true, force: true });
}
