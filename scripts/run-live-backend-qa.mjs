import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import net from 'node:net';
import { projectRoot } from './sites-env.mjs';
import { assertTestD1, TEST_DATABASE_ID, TEST_DATABASE_NAME } from './d1-test-guard.mjs';
if (!process.argv.includes('--live') || !process.argv.includes('--budget-usd=5')) throw new Error('Explicit authorized --live --budget-usd=5 required');
execFileSync('git', ['check-ignore', '.env.local'], { cwd: projectRoot, stdio: 'ignore' });
const key = readFileSync(path.join(projectRoot, '.env.local'), 'utf8').match(/^OPENAI_API_KEY=(.+)$/m)?.[1].trim();
if (!key) throw new Error('Confirmed local key missing');
const output = path.join(projectRoot, 'outputs/live-ai-qa'); mkdirSync(output, { recursive: true });
const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) || 'baseline';
if (!/^[a-z0-9_-]+$/.test(label)) throw new Error('Invalid report label');
const reportFile = path.join(output, `SKILLER_Live_Backend_QA_2026-11-01_${label}.json`);
if (existsSync(reportFile)) throw new Error('Report exists: choose another label');
const ledgerFile = path.join(output, 'budget-ledger.json');
const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
const report = { startedAt: new Date().toISOString(), scope: 'Real trainerCommand, D1, orchestration and live model through a bounded local proxy; not browser/auth-route/real-phone/clinical acceptance', apiCalls: [], steps: [], completed: false, startingMeasuredUsd: ledger.measuredUsd };
const save = () => { writeFileSync(reportFile, JSON.stringify(report, null, 2)); writeFileSync(ledgerFile, JSON.stringify(ledger)); };
const cap = randomBytes(24).toString('hex');
let fatal;
const proxy = createServer(async (request, response) => {
  const fail = (status, message) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: { type: message } })); };
  if (request.url !== '/responses' || request.method !== 'POST' || request.headers['x-qa-capability'] !== cap) { request.resume(); return fail(403, 'qa_refused'); }
  let raw = ''; for await (const chunk of request) { raw += chunk; if (Buffer.byteLength(raw) > 100000) return fail(413, 'qa_body_limit'); }
  try {
    const body = JSON.parse(raw);
    if (body.model !== 'gpt-4.1-mini' || body.store !== false || !Number.isInteger(body.max_output_tokens) || body.max_output_tokens > 1100 || body.max_output_tokens < 1) throw new Error('Unexpected model scope');
    const reserve = (Buffer.byteLength(raw) + 4096) * 0.40 / 1e6 + body.max_output_tokens * 1.60 / 1e6;
    if (fatal || report.apiCalls.length >= 12 || ledger.reservedUsd + reserve > 5 || ledger.requests >= 225) throw new Error('QA budget/request bound reached');
    ledger.reservedUsd += reserve; ledger.requests++; save();
    const entry = { model: body.model, instructions: body.instructions ?? null, input: body.input, outputCap: body.max_output_tokens, startedAt: new Date().toISOString() };
    report.apiCalls.push(entry); save();
    const result = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: raw, signal: AbortSignal.timeout(15000) });
    const data = await result.json();
    entry.status = result.status; entry.usage = data.usage ?? null;
    if (!result.ok) { entry.errorType = data.error?.type; fatal = 'API request failed'; }
    if (data.usage) ledger.measuredUsd += (data.usage.input_tokens * 0.40 + data.usage.output_tokens * 1.60) / 1e6;
    entry.modelOutput = data.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text ?? null;
    save(); response.writeHead(result.status, { 'content-type': 'application/json' }); response.end(JSON.stringify(data));
  } catch { fatal = 'QA proxy budget/network/scope failure'; save(); fail(502, 'qa_proxy_failed'); }
});
const temporary = mkdtempSync(path.join(tmpdir(), 'skiller-d1-live-backend-'));
const configPath = path.join(temporary, 'wrangler.test.jsonc'), persistPath = path.join(temporary, 'state');
const wrangler = path.join(projectRoot, 'node_modules/wrangler/bin/wrangler.js');
const environment = { ...process.env, SKILLER_ENV: 'test', SKILLER_AI_DISABLED: '0', OPENAI_API_KEY: '', CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', WRANGLER_SEND_METRICS: 'false' };
assertTestD1({ environment: 'test', configPath, databaseName: TEST_DATABASE_NAME, databaseId: TEST_DATABASE_ID, persistPath });
let worker;
const watchdog = setTimeout(() => { worker?.kill('SIGTERM'); proxy.closeAllConnections(); console.error('Live backend QA timed out'); process.exitCode = 1; }, 240000);
try {
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
  writeFileSync(configPath, JSON.stringify({ name: 'skiller-live-qa', main: path.join(projectRoot, 'scripts/live-backend-worker.ts'), compatibility_date: '2026-05-22', compatibility_flags: ['nodejs_compat'], vars: { SKILLER_ENV: 'test', SKILLER_AI_DISABLED: '0', OPENAI_MODEL: 'gpt-4.1-mini', OPENAI_API_KEY: 'local-proxy-not-a-provider-key', QA_PROXY_URL: proxyUrl, QA_CAPABILITY: cap }, d1_databases: [{ binding: 'DB', database_name: TEST_DATABASE_NAME, database_id: TEST_DATABASE_ID, migrations_dir: path.join(projectRoot, 'drizzle') }] }));
  const base = ['--config', configPath, '--local', '--persist-to', persistPath];
  execFileSync(process.execPath, [wrangler, 'd1', 'migrations', 'apply', TEST_DATABASE_NAME, ...base], { cwd: projectRoot, env: environment, stdio: 'ignore' });
  const socket = net.createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const url = `http://127.0.0.1:${port}`;
  worker = spawn(process.execPath, [wrangler, 'dev', ...base, '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0'], { cwd: projectRoot, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  // Suppress runtime bindings/logs; the real key is never given to the child process.
  worker.stdout.resume(); worker.stderr.resume(); worker.on('error', () => { fatal = 'Local worker failed'; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (fatal || worker.exitCode !== null) throw new Error('Local worker startup failed');
    try { const response = await fetch(`${url}/health`, { headers: { 'x-qa-capability': cap }, signal: AbortSignal.timeout(1000) }); await response.text(); if (response.status === 200) { ready = true; break; } } catch { /* bounded startup */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Local worker must become ready');
  const session = new Map();
  const call = async (user, payload, options = {}) => {
    if (!session.has(user)) session.set(user, crypto.randomUUID());
    const command = { requestId: crypto.randomUUID(), sessionId: session.get(user), ...payload };
    const response = await fetch(`${url}/${options.state ? 'state' : 'command'}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-qa-capability': cap }, body: JSON.stringify({ user, command }), signal: AbortSignal.timeout(25000) });
    const state = await response.json(); assert.equal(response.status, 200, 'Backend command must succeed'); assert.ok(!fatal, 'Live calls must not silently fail into fallback');
    report.steps.push({ user, action: options.state ? 'state' : payload.action, text: payload.text ?? null, messages: state.messages, plans: state.plans, pendingFollowUp: state.pendingFollowUp, contextualMemory: state.contextualMemory }); save(); return { state, command };
  };
  const onboard = async (user, trainerId) => call(user, { action: 'onboard', name: 'Синтетический пилот', trainerId, text: 'Хочу спокойнее начинать отчёт', consent: true });
  for (const trainer of ['marsha', 'beck', 'skinny']) {
    await onboard(trainer, trainer);
    const before = report.apiCalls.length;
    const first = await call(trainer, { action: 'message', mode: 'talk', text: 'Откладываю отчёт и открываю новости. Пока ничего не делал. Дайте один посильный шаг.' });
    assert.equal(report.apiCalls.length, before + 1, 'The real backend must actually call the model');
    assert.equal(first.state.plans.length, 0, 'A live chat reply is not a skill attempt');
    if (first.state.messages.at(-1).text.includes('Можно начать с одного шага:')) assert.ok(!first.state.messages.at(-1).text.includes('?'), 'Direct-start fallback must not loop back to a menu');
    const replay = await call(trainer, first.command);
    assert.equal(report.apiCalls.length, before + 1, 'Request replay must not call the model again');
    assert.deepEqual(replay.state, first.state);
    const corrected = await call(trainer, { action: 'message', mode: 'talk', text: 'Поправка: я не боюсь оценки. Я просто устал после работы. Пока не начинал.' });
    assert.equal(report.apiCalls.length, before + 2);
    assert.ok(JSON.stringify(report.apiCalls.at(-1).input).includes('Поправка:'), 'Correction reaches the model');
    session.set(trainer, crypto.randomUUID());
    const reopened = await call(trainer, { action: 'open' });
    assert.ok(reopened.state.messages.some(message => message.text.includes('Поправка:')));
    assert.equal(reopened.state.plans.length, corrected.state.plans.length);
    console.log(`Live backend: ${trainer} history, correction, idempotency and reopen passed`);
  }
  await onboard('practice', 'marsha');
  const prepared = await call('practice', { action: 'quickStop', text: 'Хочу сделать паузу перед резким ответом', intensity: 5, risk: 'no', urge: 'attack' });
  const plan = prepared.state.plans[0]; assert.ok(plan && !plan.attempt_id && !plan.result);
  await call('practice', { action: 'start', planId: plan.id });
  await call('practice', { action: 'performance', planId: plan.id, result: 'partial' });
  const beforeBenefit = report.apiCalls.length;
  const benefit = await call('practice', { action: 'message', mode: 'talk', text: 'Сделано только частично. Пользу пока не оценивал.' });
  assert.equal(report.apiCalls.length, beforeBenefit, 'Pending benefit is handled deterministically');
  assert.equal(benefit.state.plans[0].id, plan.id); assert.equal(benefit.state.plans[0].result, null); assert.equal(benefit.state.plans[0].reported_result, 'partial');
  session.set('practice', crypto.randomUUID()); const restored = await call('practice', { action: 'open' });
  assert.equal(restored.state.plans[0].reported_result, 'partial'); assert.equal(restored.state.plans[0].result, null);
  let riskIndex = 0;
  for (const text of ['Не уверен, что могу сейчас оставаться в безопасности', 'Уже три ночи почти не сплю, ощущаю всемогущество, собираюсь всё вложить в проект', 'Кажется, за мной следят, и я должен срочно защищаться']) {
    const user = `risk${++riskIndex}`; await onboard(user, 'beck'); const before = report.apiCalls.length;
    const result = await call(user, { action: 'message', mode: 'talk', text });
    assert.equal(report.apiCalls.length, before, 'Risk stops before API'); assert.equal(result.state.profile.safety_flag, 1); assert.equal(result.state.plans.length, 0);
  }
  report.completed = true; report.completedAt = new Date().toISOString(); report.measuredUsdTotal = ledger.measuredUsd; save();
  console.log(JSON.stringify({ passed: true, apiCalls: report.apiCalls.length, steps: report.steps.length, measuredUsdTotal: ledger.measuredUsd, reportFile }));
} finally {
  if (worker && worker.exitCode === null) { const exited = once(worker, 'exit'); worker.kill('SIGTERM'); const timer = setTimeout(() => worker.kill('SIGKILL'), 5000); try { await exited; } finally { clearTimeout(timer); } }
  proxy.closeIdleConnections(); await new Promise(resolve => proxy.close(resolve)); clearTimeout(watchdog); rmSync(temporary, { recursive: true, force: true });
}
