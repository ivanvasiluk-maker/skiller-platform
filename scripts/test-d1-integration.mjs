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
    reasonCode: "first_try",
    decisionVersion: "outcome-policy-v1",
    selectedSkillId: "micro-start",
    shouldResize: false,
  });

  const repeatHelpful = await runScenario(baseUrl, "repeat_helpful");
  assert.deepEqual(repeatHelpful, {
    prior: { completed: true, helpfulness: 7, avoidance: false },
    reasonCode: "repeat_helpful",
    decisionVersion: "outcome-policy-v1",
    selectedSkillId: "micro-start",
    shouldResize: false,
  });

  const resizeAfterFailed = await runScenario(baseUrl, "resize_after_failed");
  assert.deepEqual(resizeAfterFailed, {
    prior: { completed: false, helpfulness: 5, avoidance: false },
    reasonCode: "resize_after_failed",
    decisionVersion: "outcome-policy-v1",
    selectedSkillId: "micro-start",
    shouldResize: true,
  });

  const replaceLowFit = await runScenario(baseUrl, "replace_low_fit");
  assert.deepEqual(replaceLowFit, {
    prior: { completed: true, helpfulness: 2, avoidance: false },
    reasonCode: "replace_low_fit",
    decisionVersion: "outcome-policy-v1",
    selectedSkillId: "distract-delay",
    shouldResize: false,
  });

  console.log(
    "D1 recommendation integration passed: first_try, repeat_helpful, resize_after_failed, and replace_low_fit use migrated history and production decision code.",
  );
} finally {
  if (worker && worker.exitCode === null) worker.kill("SIGTERM");
  rmSync(persistPath, { recursive: true, force: true });
}
