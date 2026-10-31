// Real application routes on a local, disposable D1; no AI or production writes.
import assert from 'node:assert/strict';
const target = new URL(process.env.SKILLER_UI_TEST_URL);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) throw new Error('Local test server required');
const url = path => new URL(path, target);
const send = async (path, options = {}) => {
  const response = await fetch(url(path), { redirect: 'manual', signal: AbortSignal.timeout(15000), ...options });
  // Drain even expected 401/403 responses before reusing an HTTP connection.
  // The application client also consumes every API response with response.json().
  const bytes = await response.arrayBuffer();
  return new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
};
const spoof = await send('/api/trainer', { headers: { 'oai-authenticated-user-id': 'victim', 'oai-authenticated-user-email': 'victim@example.invalid' } });
assert.equal(spoof.status, 401, 'Public worker must ignore forged user headers');
const malformed = await send('/api/trainer', { headers: { cookie: '__Host-skiller_guest=%ZZ' } });
assert.equal(malformed.status, 401);
for (const path of ['/api/skiller', '/api/privacy', '/api/group-requests']) {
  assert.equal((await send(path, { method: path === '/api/skiller' ? 'POST' : 'GET', headers: { 'oai-authenticated-user-id': 'victim', 'oai-authenticated-user-email': 'victim@example.invalid' } })).status, 401,
    `${path} must reject forged identity without a session`);
}
async function guest() {
  const response = await send('/api/auth/guest');
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').split(';')[0];
}
const cookie = await guest();
const guestAgain = await send('/api/auth/guest', { headers: { cookie } });
assert.equal(guestAgain.headers.get('set-cookie').split(';')[0], cookie, 'Re-entry must preserve identity');
const second = await guest();
assert.notEqual(cookie, second);
const post = async (path, body, identity = cookie, headers = {}) => send(path, { method: 'POST', headers: { cookie: identity, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const sessionId = crypto.randomUUID();
async function command(body, identity = cookie) {
  const response = await post('/api/trainer', { requestId: crypto.randomUUID(), sessionId, ...body }, identity);
  const text = await response.text();
  assert.equal(response.status, 200, `${body.action}: ${text}`);
  const state = JSON.parse(text);
  return state;
}
const origin = await post('/api/trainer', {}, cookie, { origin: 'bad origin' });
assert.equal(origin.status, 403);
await command({ action: 'onboard', name: 'Acceptance', trainerId: 'marsha', text: 'Откладываю отчёт и читаю новости', consent: true });
const switched = await command({ action: 'settings', trainerId: 'beck' });
assert.equal(switched.profile.trainer_id, 'beck');
const state = await command({ action: 'quickStop', text: 'Волнуюсь из-за рабочего отчёта', intensity: 6, risk: 'no' });
const plan = state.plans.find(item => !item.result);
assert.ok(plan, 'Practice must be recommended');
const requestId = crypto.randomUUID();
const payload = { requestId, sessionId, action: 'start', planId: plan.id };
const first = await post('/api/trainer', payload);
const replay = await post('/api/trainer', payload);
assert.equal(first.status, 200);
assert.deepEqual(await first.json(), await replay.json(), 'Duplicate request returns cached response');
await command({ action: 'performance', planId: plan.id, result: 'done' });
const done = await command({ action: 'outcome', planId: plan.id, result: 'done', helpfulness: 7, intensity: 4 });
assert.equal(done.plans.find(item => item.id === plan.id).result, 'done');
const restoredResponse = await send('/api/trainer', { headers: { cookie } });
assert.equal(restoredResponse.headers.get('cache-control'), 'no-store');
const restored = await restoredResponse.json();
assert.equal(restored.profile.trainer_id, 'beck');
assert.equal(restored.plans.find(item => item.id === plan.id).helpfulness, 7);
const isolated = await (await send('/api/trainer', { headers: { cookie: second } })).json();
assert.equal(isolated.profile, null);
assert.equal(isolated.plans.length, 0);
await command({ action: 'onboard', name: 'Other account', trainerId: 'beck', text: 'Another synthetic task', consent: true }, second);
const crossAccount = await post('/api/trainer', { action: 'start', requestId: crypto.randomUUID(), sessionId, planId: plan.id }, second);
assert.equal(crossAccount.status, 400, 'A second onboarded account cannot operate on another account plan');
const unchanged = await (await send('/api/trainer', { headers: { cookie } })).json();
assert.equal(unchanged.plans.find(item => item.id === plan.id).result, 'done', 'Rejected cross-account write must preserve the original outcome');
const groupResponse = await post('/api/group-requests', { contact: '@synthetic_http', consent: true });
assert.equal(groupResponse.status, 202);
const group = await groupResponse.json();
const duplicateLead = await (await post('/api/group-requests', { contact: '@synthetic_http', consent: true })).json();
assert.equal(group.id, duplicateLead.id);
assert.equal((await send('/api/group-requests/admin')).status, 403);
assert.equal((await send('/api/privacy/admin')).status, 403);
// Administrative credentials are separate from each other and from user cookies.
for (const [path, wrongKey] of [
  ['/api/privacy/admin', 'local-synthetic-owner'],
  ['/api/group-requests/admin', 'local-synthetic-privacy-owner'],
]) {
  assert.equal((await send(path, { headers: { cookie, authorization: `Bearer ${wrongKey}` } })).status, 403);
}
const myGroup = await (await send('/api/group-requests', { headers: { cookie } })).json();
const otherGroup = await (await send('/api/group-requests', { headers: { cookie: second } })).json();
assert.ok(JSON.stringify(myGroup).includes(group.id));
assert.ok(!JSON.stringify(otherGroup).includes(group.id), 'Another user cannot see a group request');
const unverifiedPayment = await send('/api/group-requests/admin', { method: 'PATCH', headers: { authorization: 'Bearer local-synthetic-owner', 'content-type': 'application/json' }, body: JSON.stringify({ id: group.id, status: 'confirmed' }) });
assert.equal(unverifiedPayment.status, 400);
await command({ action: 'message', text: 'Я хочу убить себя' });
const denied = await post('/api/skiller', { action: 'start', skillId: 'micro-start' });
assert.equal(denied.status, 400, 'Legacy route cannot bypass trainer safety flag');
const recommended = await (await post('/api/skiller', { action: 'recommend', description: 'Откладываю отчёт', risk: 'no', kind: 'stuck' })).json();
assert.equal(recommended.skill, null);
assert.equal(recommended.safetyStatus, 'escalate');
// A ReadableStream is sent chunked, with no Content-Length claim.
const oversized = await send('/api/trainer', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, duplex: 'half', body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('я'.repeat(6000))); controller.close(); } }) });
assert.equal(oversized.status, 413);
await oversized.arrayBuffer();
const afterRejected = await send('/api/trainer', { headers: { cookie } });
assert.equal(afterRejected.status, 200, 'Server remains available after rejected stream');
await command({ action: 'open' });
await command({ action: 'safeAgain', risk: 'no' });
const resumed = await (await post('/api/skiller', { action: 'recommend', description: 'Откладываю отчёт и читаю новости', risk: 'no', kind: 'stuck' })).json();
assert.ok(resumed.skill, 'Explicit reassessment clears the cross-API safety hold');
const privateCookie = cookie;
const privacy = await post('/api/privacy', { confirmation: 'УДАЛИТЬ' });
assert.equal(privacy.status, 202);
const receipt = await privacy.json();
assert.equal(receipt.request.status, 'requested');
const otherPrivacy = await (await send('/api/privacy', { headers: { cookie: second } })).json();
assert.equal(otherPrivacy.request, null, 'Erasure status is scoped to the authenticated account');
assert.equal((await post('/api/trainer', { requestId: crypto.randomUUID(), sessionId, action: 'open' }, privateCookie)).status, 409);
const blockedPurge = await send('/api/privacy/admin', { method: 'POST', headers: { authorization: 'Bearer local-synthetic-privacy-owner', 'content-type': 'application/json' }, body: JSON.stringify({ id: receipt.request.id, confirmation: 'PURGE_VERIFIED', mirrorsVerified: true }) });
assert.equal(blockedPurge.status, 409, 'Purge is forbidden outside maintenance');
assert.equal((await send('/api/trainer', { headers: { cookie: second } })).status, 200, 'Other account remains usable');
console.log('HTTP acceptance PASS: forged headers, malformed cookie/origin, guest continuity, streamed size limit, onboarding, trainer settings, practice/outcome, idempotency, reload, user isolation and cross-API safety.');
