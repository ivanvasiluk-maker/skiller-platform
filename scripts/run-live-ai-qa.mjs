// Explicitly authorized, synthetic-only component QA. Never reads production records.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { produceFreeTalkReply } from '../lib/free-talk.ts';
import { getCharacterBible, buildFreeTalkFallback, validateTrainerReply } from '../lib/character-bible.ts';
import { CHARACTER_VERSION, requiresSafetyRoute, safetyMessage } from '../lib/trainers.ts';
const root = fileURLToPath(new URL('..', import.meta.url));
if (!process.argv.includes('--live') || !process.argv.includes('--budget-usd=5')) throw new Error('Requires explicit --live --budget-usd=5 after owner authorization');
execFileSync('git', ['check-ignore', '.env.local'], { cwd: root, stdio: 'ignore' });
const apiKey = readFileSync(path.join(root, '.env.local'), 'utf8').match(/^OPENAI_API_KEY=(.+)$/m)?.[1].trim();
if (!apiKey) throw new Error('Confirmed local key is missing');
const source = readFileSync(path.join(root, 'docs/release/AI_ACCEPTANCE_CASES.md'), 'utf8');
const cases = source.split('\n').map(line => line.match(/^\| (\d+) \| (.*?) \| (.*?) \|$/)).filter(Boolean).map(match => ({ id: Number(match[1]), input: match[2].match(/«(.*?)»/)?.[1] ?? match[2], expected: match[3] }));
const outputDirectory = path.join(root, 'outputs/live-ai-qa'); mkdirSync(outputDirectory, { recursive: true });
const label = process.argv.find(value => value.startsWith('--label='))?.slice(8) || 'baseline';
if (!/^[a-z0-9_-]+$/.test(label)) throw new Error('Invalid report label');
const selected = process.argv.find(value => value.startsWith('--cases='))?.slice(8).split(',').map(Number);
if (selected && (!selected.length || selected.some(value => !Number.isInteger(value) || value < 1 || value > 30))) throw new Error('Invalid case selection');
const ledgerPath = path.join(outputDirectory, 'budget-ledger.json');
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { requests: 0, measuredUsd: 0, reservedUsd: 0 };
const reportPath = path.join(outputDirectory, `SKILLER_Live_AI_QA_2026-11-01_${label}.json`);
if (existsSync(reportPath)) throw new Error('Report already exists: choose a new --label');
const rate = { inputUsdPerMillion: 0.40, outputUsdPerMillion: 1.60, model: 'gpt-4.1-mini', source: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini', checkedAt: '2026-11-01' };
const report = { characterVersion: CHARACTER_VERSION, startedAt: new Date().toISOString(), completedAt: null, scope: 'Synthetic single-turn FreeTalk component, not full trainerCommand/D1/orchestrator or clinical acceptance', budgetUsd: 5, rate, startingRequests: ledger.requests, startingMeasuredUsd: ledger.measuredUsd, requests: ledger.requests, measuredUsd: ledger.measuredUsd, reservedUsd: ledger.reservedUsd, ledgerBasis: 'Existing local ledger or zero for a new run', rows: [], stopped: null };
const save = () => { writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); writeFileSync(ledgerPath, JSON.stringify({ requests: report.requests, measuredUsd: report.measuredUsd, reservedUsd: report.reservedUsd })); };
let fatal = null;
for (const item of cases) {
  if (selected && !selected.includes(item.id)) continue;
  if (item.id >= 28) { report.rows.push({ ...item, scope: 'Existing deterministic integration scenario; not sent as a live utterance' }); continue; }
  for (const trainerId of ['marsha', 'beck', 'skinny']) {
    if (requiresSafetyRoute(item.input, 'no')) {
      report.rows.push({ ...item, trainerId, route: 'deterministic_safety', shownReply: safetyMessage, review: 'pending_expert', scope: 'Same routing predicate, not full server state persistence' }); save(); continue;
    }
    let audit = {};
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body);
      if (url !== 'https://api.openai.com/v1/responses' || body.model !== rate.model || body.max_output_tokens > 450 || body.store !== false) throw new Error('Unexpected request scope');
      // UTF-8 body bytes + conservative protocol allowance bound input tokens; reserve output at its cap.
      const upper = (Buffer.byteLength(options.body, 'utf8') + 4096) * rate.inputUsdPerMillion / 1e6 + 450 * rate.outputUsdPerMillion / 1e6;
      if (report.reservedUsd + upper > 5 || report.requests >= 225) { fatal = 'Budget/request bound reached'; throw new Error('Budget stopped'); }
      report.reservedUsd += upper; report.requests++; save();
      const started = Date.now();
      try {
        const response = await fetch(url, options);
        const data = await response.clone().json().catch(() => ({}));
        audit = { httpStatus: response.status, elapsedMs: Date.now() - started, usage: data.usage ?? null };
        if (!response.ok) { audit.errorType = data.error?.type; audit.errorCode = data.error?.code; fatal = `API status ${response.status}`; return response; }
        const raw = data.output?.flatMap(row => row.content ?? []).find(content => content.type === 'output_text')?.text;
        try { audit.modelReply = JSON.parse(raw).reply; } catch { audit.modelReply = null; }
        audit.guard = typeof audit.modelReply === 'string' ? validateTrainerReply(audit.modelReply) : { ok: false, violations: ['invalid_model_json'] };
        if (data.usage) report.measuredUsd += (data.usage.input_tokens * rate.inputUsdPerMillion + data.usage.output_tokens * rate.outputUsdPerMillion) / 1e6;
        return response;
      } catch { fatal = 'Network/timeout failure; no automatic retry'; audit = { networkFailure: true, elapsedMs: Date.now() - started }; throw new Error('API unavailable'); }
    };
    const shownReply = await produceFreeTalkReply({ profile: { trainer_id: trainerId, interaction_mode: 'explore', address_form: 'formal', grammatical_gender: 'neutral' }, messages: [{ role: 'user', text: item.input }], apiKey, model: rate.model, fetchImpl });
    report.rows.push({ ...item, trainerId, route: 'live_freetalk_component', ...audit, shownReply, fallbackUsed: shownReply === buildFreeTalkFallback(getCharacterBible(trainerId)), review: 'pending_expert' });
    save(); console.log(`QA case ${item.id}/${trainerId}: status=${audit.httpStatus ?? 'unavailable'}, expert review pending`);
    if (fatal) break;
  }
  if (fatal) break;
}
report.completedAt = new Date().toISOString(); report.stopped = fatal; save();
console.log(JSON.stringify({ completed: !fatal, requests: report.requests, measuredUsd: report.measuredUsd, reservedUsd: report.reservedUsd, rows: report.rows.length, reportPath, stopped: fatal }));
if (fatal) process.exitCode = 1;
