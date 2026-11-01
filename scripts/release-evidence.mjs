import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
export const RELEASE_GATES = [
  'ci', 'migrationRecovery', 'browserAcceptance', 'productionRestore',
  'productionBinding', 'externalAutodeployDisabled', 'liveModelReview',
  'realDeviceVoice', 'offerAndAccess', 'costMonitoring', 'rollbackPlan', 'ownerRelease',
];
/** Validate operator-reviewed evidence; this does not independently verify external services. */
export function assessReleaseEvidence(evidence, candidate) {
  const issues = [];
  if (candidate.dirty) issues.push('Working tree is not clean');
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return [...issues, 'Evidence must be a JSON object'];
  if (evidence.schemaVersion !== 1) issues.push('Unsupported evidence schema');
  if (!/^[a-f0-9]{40}$/.test(evidence.commitSha ?? '') || evidence.commitSha !== candidate.commitSha) issues.push('Evidence does not match the exact HEAD commit');
  if (!/^[a-f0-9]{40}$/.test(evidence.treeSha ?? '') || evidence.treeSha !== candidate.treeSha) issues.push('Evidence does not match the source tree');
  if (!['in_app', 'external'].includes(evidence.reminderChannel)) issues.push('Choose the actual reminder channel');
  const gates = evidence.reminderChannel === 'external' ? [...RELEASE_GATES, 'externalReminderDelivery'] : RELEASE_GATES;
  for (const name of gates) {
    const check = evidence.checks?.[name];
    if (check?.status !== 'passed') { issues.push(`${name}: not accepted`); continue; }
    if (typeof check.reference !== 'string' || !check.reference.trim()) issues.push(`${name}: evidence reference missing`);
    if (typeof check.reviewedBy !== 'string' || !check.reviewedBy.trim()) issues.push(`${name}: reviewer missing`);
    if (typeof check.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(check.reviewedAt) || !Number.isFinite(Date.parse(check.reviewedAt))) issues.push(`${name}: review timestamp missing or invalid`);
  }
  return issues;
}
export function candidateState(cwd) {
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  return { commitSha: git(['rev-parse', 'HEAD']), treeSha: git(['rev-parse', 'HEAD^{tree}']), dirty: Boolean(git(['status', '--porcelain', '--untracked-files=normal'])) };
}
export function assertReleaseFile(file, cwd) {
  if (!file) throw new Error('Release blocked: supply --release-evidence=PATH for the reviewed candidate.');
  let evidence;
  try { evidence = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new Error('Release blocked: evidence file is unreadable or invalid JSON.'); }
  const candidate = candidateState(cwd);
  const issues = assessReleaseEvidence(evidence, candidate);
  if (issues.length) throw new Error(`Release blocked: ${issues.join('; ')}`);
  return candidate;
}
