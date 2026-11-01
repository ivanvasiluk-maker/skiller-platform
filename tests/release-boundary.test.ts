import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { boundedRequest, RequestBoundaryError, assertSameOrigin } from '../lib/request-boundary.ts';
import { requiresSafetyRoute } from '../lib/trainers.ts';
import { readGuestId } from '../lib/guest-session.ts';

test('actual bytes enforce body limit without Content-Length and with multibyte text', async () => {
  const request = new Request('https://example.test/api/trainer', { method: 'POST', body: 'я'.repeat(6000) });
  await assert.rejects(boundedRequest(request, 10000), (error: unknown) => error instanceof RequestBoundaryError && error.status === 413);
  const accepted = await boundedRequest(new Request('https://example.test/api/trainer', { method: 'POST', body: '{"action":"open"}' }), 10000);
  assert.deepEqual(await accepted.json(), { action: 'open' });
});
test('malformed, foreign, and cross-site origins fail closed', () => {
  for (const headers of ([{ origin: 'null' }, { origin: 'not a url' }, { origin: 'https://evil.test' }, { 'sec-fetch-site': 'cross-site' }] as Record<string, string>[])) {
    assert.throws(() => assertSameOrigin(new Request('https://example.test/api/trainer', { headers })), RequestBoundaryError);
  }
  assert.doesNotThrow(() => assertSameOrigin(new Request('https://example.test/api/trainer', { headers: { origin: 'https://example.test' } })));
});
test('guest cookie rejects malformed escapes, duplicate identity and non-UUID', () => {
  const id = '00000000-0000-4000-8000-000000000042';
  assert.equal(readGuestId(`__Host-skiller_guest=${id}`), id);
  for (const value of ['__Host-skiller_guest=%ZZ', '__Host-skiller_guest=123', `__Host-skiller_guest=${id}; __Host-skiller_guest=${id}`]) assert.equal(readGuestId(value), null);
});
test('production deploy refuses an unconfirmed command and CI even with the flag', () => {
  for (const [args, ci] of [[[], ''], [['--confirm-production=skiller-platform'], 'true']] as const) {
    const result = spawnSync(process.execPath, ['scripts/deploy.mjs', 'deploy', ...args], { encoding: 'utf8', env: { ...process.env, CI: ci } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Production deploy refused/);
    assert.doesNotMatch(result.stdout, /build production bundle|apply D1 migrations|deploy worker/);
  }
});

test('explicit death wishes stop practice even if the form says no risk', () => {
  for (const text of ['Я хочу умереть', 'Мне хочется умереть', 'I want to die', 'I will end my life', 'Не хачу жыць']) assert.equal(requiresSafetyRoute(text, 'no'), true, text);
  assert.equal(requiresSafetyRoute('Откладываю отчёт и читаю новости', 'no'), false);
});


test('explicit uncertainty about staying safe stops practice without requiring a death keyword', () => {
  for (const text of [
    "Не уверен, что могу сейчас оставаться в безопасности",
    "Не уверена, что смогу быть в безопасности",
    "Не знаю, смогу ли оставаться в безопасности",
    "I am not sure I can stay safe",
  ]) assert.equal(requiresSafetyRoute(text, "no"), true, text);
  for (const text of ["Я уверен, что могу оставаться в безопасности", "Не уверен, что могу закончить отчёт", "Хочу безопасно отправить отчёт"]) assert.equal(requiresSafetyRoute(text, "no"), false, text);
});


test('combined activation/defensive risk statements pause practice without diagnosing ordinary stress', () => {
  assert.equal(requiresSafetyRoute("Уже три ночи почти не сплю, ощущаю всемогущество, собираюсь всё вложить в проект", "no"), true);
  assert.equal(requiresSafetyRoute("Кажется, за мной следят, и я должен срочно защищаться", "no"), true);
  assert.equal(requiresSafetyRoute("Три ночи плохо сплю из-за отчёта", "no"), false);
  assert.equal(requiresSafetyRoute("Кажется, за мной следят. Хочу спокойно обсудить, откуда эта мысль", "no"), false);
});
