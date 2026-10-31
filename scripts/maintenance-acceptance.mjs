// Real HTTP routes with maintenance enabled; no external services or user data.
import assert from 'node:assert/strict';
const target = new URL(process.env.SKILLER_UI_TEST_URL);
assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
async function send(path, options = {}) {
  const response = await fetch(new URL(path, target), { redirect: 'manual', signal: AbortSignal.timeout(15000), ...options });
  const bytes = await response.arrayBuffer();
  return new Response(bytes, { status: response.status, headers: response.headers });
}
const entry = await send('/api/auth/guest');
assert.equal(entry.status, 303);
const cookie = entry.headers.get('set-cookie').split(';')[0];
for (const [path, body] of [
  ['/api/trainer', { action: 'onboard', requestId: crypto.randomUUID(), sessionId: crypto.randomUUID(), name: 'Synthetic', trainerId: 'marsha', text: 'Synthetic task', consent: true }],
  ['/api/skiller', { action: 'recommend', description: 'Synthetic task', risk: 'no' }],
  ['/api/group-requests', { contact: '@synthetic_maintenance', consent: true }],
  ['/api/export', {}],
  ['/api/day-tasks', { action: 'add', date: '2026-10-31', timezone: 'Europe/Vilnius', text: 'Forbidden task' }],
]) {
  const response = await send(path, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 503, `${path} must be paused during maintenance`);
}
assert.equal((await send('/api/trainer', { headers: { cookie } })).status, 503,
  'Trainer state must not perform lazy writes during maintenance');
for (const [path, key] of [
  ['/api/privacy/admin', 'local-synthetic-privacy-owner'],
  ['/api/group-requests/admin', 'local-synthetic-owner'],
]) {
  const response = await send(path, { headers: { authorization: `Bearer ${key}` } });
  assert.equal(response.status, 200, 'Owner review remains available for maintenance');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), [], 'Blocked group request must not persist');
}
console.log('Maintenance acceptance PASS: trainer, legacy writes, group requests and exports paused; no profile/plan/lead created; owner review remains available.');
