import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RELEASE_GATES, assessReleaseEvidence } from '../scripts/release-evidence.mjs';
const candidate = { commitSha: 'a'.repeat(40), treeSha: 'b'.repeat(40), dirty: false };
const check = { status: 'passed', reference: 'synthetic review evidence', reviewedBy: 'Synthetic reviewer', reviewedAt: '2026-11-01T08:00:00Z' };
const accepted = () => ({ schemaVersion: 1, ...candidate, reminderChannel: 'in_app', checks: Object.fromEntries(RELEASE_GATES.map(name => [name, { ...check }])) });
test('exact clean candidate with complete reviewed evidence can pass the read-only guard', () => {
  assert.deepEqual(assessReleaseEvidence(accepted(), candidate), []);
});
test('missing evidence, changed source, dirty worktree and pending external gates block release', () => {
  assert.ok(assessReleaseEvidence(null, candidate).length);
  assert.ok(assessReleaseEvidence(accepted(), { ...candidate, dirty: true }).some(value => /not clean/.test(value)));
  assert.ok(assessReleaseEvidence(accepted(), { ...candidate, commitSha: 'c'.repeat(40) }).some(value => /HEAD/.test(value)));
  assert.ok(assessReleaseEvidence(accepted(), { ...candidate, treeSha: 'c'.repeat(40) }).some(value => /source tree/.test(value)));
  const evidence = accepted(); evidence.checks.productionRestore.status = 'pending';
  assert.ok(assessReleaseEvidence(evidence, candidate).some(value => /productionRestore/.test(value)));
});
test('a checked box without review identity, date or evidence cannot pass', () => {
  for (const field of ['reference', 'reviewedBy', 'reviewedAt']) {
    const evidence = accepted(); evidence.checks.ci[field] = '';
    assert.ok(assessReleaseEvidence(evidence, candidate).some(value => value.startsWith('ci:')));
  }
  const evidence = accepted(); evidence.checks.ci.reviewedAt = 'yesterday';
  assert.ok(assessReleaseEvidence(evidence, candidate).length);
});
test('external reminder promises require additional delivery evidence; in-app scope is explicit', () => {
  const evidence = accepted(); evidence.reminderChannel = 'external';
  assert.ok(assessReleaseEvidence(evidence, candidate).some(value => /externalReminderDelivery/.test(value)));
  evidence.checks.externalReminderDelivery = { ...check };
  assert.deepEqual(assessReleaseEvidence(evidence, candidate), []);
  evidence.reminderChannel = 'unspecified';
  assert.ok(assessReleaseEvidence(evidence, candidate).some(value => /channel/.test(value)));
});
test('actual deploy stops before build or remote commands with absent or rejected evidence', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'skiller-release-guard-'));
  try {
    const file = path.join(directory, 'rejected.json'); writeFileSync(file, JSON.stringify(accepted()));
    for (const args of [[], [`--release-evidence=${file}`]]) {
      const result = spawnSync(process.execPath, ['scripts/deploy.mjs', 'deploy', '--confirm-production=skiller-platform', ...args], { encoding: 'utf8', env: { ...process.env, CI: '' } });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Release blocked/);
      assert.doesNotMatch(result.stdout, /build production bundle|apply D1 migrations|deploy worker/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
