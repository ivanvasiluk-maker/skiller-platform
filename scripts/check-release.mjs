// Read-only: no build, migration, cloud authentication or deployment.
import { candidateState, assessReleaseEvidence } from './release-evidence.mjs';
import { readFileSync } from 'node:fs';
import { projectRoot } from './sites-env.mjs';
const file = process.argv.find(arg => arg.startsWith('--release-evidence='))?.slice('--release-evidence='.length);
try {
  const candidate = candidateState(projectRoot);
  const evidence = file ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const blockers = assessReleaseEvidence(evidence, candidate);
  console.log(JSON.stringify({ ...candidate, ready: blockers.length === 0, blockers }, null, 2));
  process.exitCode = blockers.length ? 1 : 0;
} catch { console.error('Release check failed: inspect the checkout and evidence JSON.'); process.exitCode = 1; }
