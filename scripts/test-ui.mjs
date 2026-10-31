// Browser acceptance against the built application, never production data.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { projectRoot } from './sites-env.mjs';
import { assertTestD1, TEST_DATABASE_ID, TEST_DATABASE_NAME } from './d1-test-guard.mjs';

// Fail before starting a worker or touching D1 if the browser is unavailable.
const maintenance = process.argv.includes('--maintenance');
const pilot = process.argv.includes('--pilot');
const httpOnly = process.argv.includes('--http') || maintenance;
if (!httpOnly) {
  const { launchBrowser } = await import('./browser-launch.mjs');
  const probe = await launchBrowser();
  await probe.close();
}

const buildConfigPath = path.join(projectRoot, 'dist/server/wrangler.json');
const built = JSON.parse(readFileSync(buildConfigPath, 'utf8'));
const temporary = mkdtempSync(path.join(tmpdir(), 'skiller-d1-ui-'));
const configPath = path.join(temporary, 'wrangler.test.jsonc');
const persistPath = path.join(temporary, 'state');
const wrangler = path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
const environment = {
  ...process.env,
  SKILLER_ENV: 'test',
  SKILLER_AI_DISABLED: '1',
  OPENAI_API_KEY: '',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
};
assertTestD1({ environment: environment.SKILLER_ENV, configPath,
  databaseName: TEST_DATABASE_NAME, databaseId: TEST_DATABASE_ID, persistPath });
let worker;
let workerError;
try {
  // Copy only bindings required by this local test, not deployment services.
  writeFileSync(configPath, JSON.stringify({
    name: 'skiller-ui-test',
    main: path.resolve(path.dirname(buildConfigPath), built.main),
    compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags,
    no_bundle: true,
    find_additional_modules: true,
    rules: built.rules,
    assets: { directory: path.resolve(path.dirname(buildConfigPath), built.assets.directory) },
    vars: { SKILLER_MAINTENANCE: maintenance ? '1' : '0', SKILLER_ENV: 'test', SKILLER_AI_DISABLED: '1', SKILLER_GROUP_OFFER_ENABLED: '1', GROUP_REQUESTS_ADMIN_SECRET: 'local-synthetic-owner', PRIVACY_ADMIN_SECRET: 'local-synthetic-privacy-owner' },
    d1_databases: [{ binding: 'DB', database_name: TEST_DATABASE_NAME,
      database_id: TEST_DATABASE_ID, migrations_dir: path.join(projectRoot, 'drizzle') }],
  }));
  const base = ['--config', configPath, '--local', '--persist-to', persistPath];
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', TEST_DATABASE_NAME, ...base],
    { cwd: projectRoot, env: environment, stdio: 'inherit' });
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  const url = `http://127.0.0.1:${port}`;
  worker = spawn(process.execPath, [wrangler, 'dev', ...base, '--ip', '127.0.0.1',
    '--port', String(port), '--inspector-port', '0'],
  { cwd: projectRoot, env: environment, stdio: ['ignore', 'inherit', 'inherit'] });
  worker.on('error', error => { workerError = error; });
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (workerError) throw workerError;
    if (worker.exitCode !== null) throw new Error('Local UI worker exited before readiness');
    try {
      const response = await fetch(`${url}/api/trainer`, { signal: AbortSignal.timeout(2000) });
      if (response.status === 401) { ready = true; break; }
    } catch { /* Worker is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Local UI worker did not become ready within 60 seconds');
  execFileSync(process.execPath, [maintenance ? 'scripts/maintenance-acceptance.mjs' : pilot ? 'scripts/pilot-ui-acceptance.mjs' : httpOnly ? 'scripts/http-acceptance.mjs' : 'scripts/mobile-ui-smoke.mjs'], {
    cwd: projectRoot, env: { ...environment, SKILLER_UI_TEST_URL: url }, stdio: 'inherit',
  });
  if (maintenance) {
    const query = sql => JSON.parse(execFileSync(process.execPath, [wrangler, 'd1', 'execute', TEST_DATABASE_NAME,
      ...base, '--command', sql, '--json'], { cwd: projectRoot, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })).flatMap(item => item.results ?? []);
    const tables = query("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('trainer_profiles','trainer_plans','group_requests','day_tasks','reminders','reminder_preferences')");
    for (const { name } of tables) {
      assert.equal(query(`SELECT count(*) AS n FROM "${name}"`)[0].n, 0, 'Maintenance must not create product records');
    }
    console.log('Maintenance D1 inspection PASS: no profile, plan or group request was persisted.');
  }
} finally {
  if (worker && worker.exitCode === null && !workerError) {
    const exited = once(worker, 'exit');
    worker.kill('SIGTERM');
    const timer = setTimeout(() => worker.kill('SIGKILL'), 5000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  rmSync(temporary, { recursive: true, force: true });
}
