# SKILLER — Stage 0 baseline

Status: frozen baseline for Round 0.1  
Baseline commit: `1b3f59a0b1525b309943db454109438b2c2d554f`  
Working branch: `codex/stage-0-baseline`

## Purpose

This document records the reproducible starting point for Stage 0. It does not
declare the product release-ready and does not authorize feature work. The next
round starts with the known TypeScript gate failure described below.

Product invariants remain governed by `docs/PRODUCT_BIBLE.md`. Frozen MVP scope
and sequencing remain governed by `docs/IMPLEMENTATION_PLAN.md`.

## Frozen scope for Stage 0

Allowed work:

- reproducible install and verification commands;
- TypeScript, lint, unit-test, and build gates;
- GitHub CI without deployment;
- physically separate test D1 configuration and guarded test seed/reset;
- product, character, skill, and decision versioning;
- event-contract and environment documentation;
- dependency remediation that preserves the current Frozen MVP behavior.

Out of scope until the corresponding later stage:

- outcome-aware repeat, transfer, resize, and replacement logic;
- Day 2–7 continuity changes;
- Google Sheets export and cohort reporting;
- new skills, courses, diagnostics, therapist marketplace, booking, social
  features, realtime voice, or gamification;
- UI redesign or expansion not required to make a Stage 0 gate testable;
- production deployment.

Out-of-scope findings go to backlog; they do not expand the active round.

## Reproduction environment

The baseline was reproduced from a clean checkout with:

| Tool | Observed version |
| --- | --- |
| Node.js | `v24.19.0` |
| npm | `11.9.0` |
| Python | `3.12.14` |
| Git | `2.51.1` |

`package.json` requires Node.js `>=22.13.0`. CI is not configured yet, so the
exact CI Node version remains a Round 0.3 decision. The local versions above are
evidence for this baseline, not a new support policy.

## Baseline verification matrix

| Gate | Command | Current result | Required result | Closure round |
| --- | --- | --- | --- | --- |
| Install | `npm ci` | PASS | PASS | 0.1 confirmed |
| Lint | `npm run lint` | PASS | PASS | 0.1 confirmed |
| TypeScript | `npx tsc --noEmit` | FAIL | PASS | 0.2 |
| Production build | `npm run build` | PASS | PASS | 0.1 confirmed |
| Python core tests | `PYTHONPATH=src python -m unittest discover -s tests -p "test_*.py"` | PASS, 4 tests | PASS | 0.1 confirmed |
| Unified local gate | `npm run verify` | NOT PRESENT | PASS | 0.2 |
| GitHub CI | push / pull request | NOT PRESENT | PASS | 0.3 |
| Test D1 smoke | planned test command | NOT PRESENT | PASS | 0.4 |
| Production dependencies | `npm audit --omit=dev --audit-level=moderate` | FAIL | PASS or documented accepted risk | 0.6 |
| Day 1→7 E2E | planned E2E command | NOT PRESENT | PASS | Stage 5, not Stage 0 |

## Known blocker: TypeScript environment declarations

`npx tsc --noEmit` currently fails with five errors:

- `lib/situation-analysis.ts`: `OPENAI_TRANSCRIBE_MODEL` is absent from
  `Cloudflare.Env`;
- `lib/situation-analysis.ts`: `OPENAI_MODEL` is absent from `Cloudflare.Env`;
- `lib/situation-analysis.ts`: `OPENAI_API_KEY` is absent from `Cloudflare.Env`;
- `lib/trainer-data.ts`: `OPENAI_API_KEY` is absent from `Cloudflare.Env`;
- `lib/trainer-data.ts`: `OPENAI_MODEL` is absent from `Cloudflare.Env`.

The production build succeeds despite this failure, so `build` alone is not a
sufficient quality gate. Round 0.2 must add the missing server-side Env types and
make typecheck part of the unified `verify` command. No secret values belong in
the declaration file or repository.

## Test coverage boundary

The four passing Python tests cover the standalone domain core: safety before
selection, a completed vertical cycle, avoidance weighting, and safe no-match
behavior. They do not exercise the current TypeScript application, D1 storage,
`/api/trainer`, `/api/skiller`, idempotency, AI fallback, browser reload, or the
Day 1→7 journey.

Therefore the current `4/4` result is valid but insufficient evidence for an
application release.

## Dependency baseline

The production dependency audit reports six vulnerabilities: one moderate,
four high, and one critical. The affected dependency paths include Next.js and
its transitive PostCSS/Sharp dependencies, plus `fast-uri`, `nanoid`, and
`baseline-browser-mapping`.

No automatic `npm audit fix --force` is authorized in Round 0.1. Dependency
changes are isolated in Round 0.6 because a forced Next.js update can also alter
Vinext and Cloudflare runtime behavior.

## Repository and deployment state

- GitHub default branch: `main`.
- GitHub baseline: `1b3f59a0b1525b309943db454109438b2c2d554f`.
- Open pull requests at baseline check: none.
- Remote branch `codex/skiller-ai-cycle` is behind `main` and has no unique
  commits.
- The current published Site is version 5 from the earlier voice-prototype
  source state. It does not include the newer Frozen MVP trainer-flow commits.
- Round 0.1 performs no deployment. GitHub source and the published Site remain
  intentionally different until a separately approved deployment checkpoint.

## Architecture facts to preserve for later work

- The main screen uses the new Trainer flow; `/journal` still exposes the prior
  protocol interface.
- Core product data uses Drizzle-backed tables while trainer and pilot tables
  are also created by runtime SQL in `lib/trainer-data.ts`.
- The trainer flow delegates skill recommendation, attempt start, and outcome
  completion to `lib/skiller-data.ts`, but maintains its own messages, plans,
  events, feedback, and request-idempotency tables.
- These facts are not rewritten in Round 0.1. Round 0.4 owns test D1 separation
  and schema/migration discipline.

## Round 0.1 acceptance

Round 0.1 is complete when:

1. the baseline commit and tool versions are recorded;
2. every current gate has a reproducible command and status;
3. the TypeScript blocker is assigned to Round 0.2;
4. Frozen Stage 0 boundaries are explicit;
5. no product behavior, dependency, database, or deployment was changed;
6. the working tree contains only this baseline document before commit;
7. the next entry point is unambiguous.

## Next entry point: Round 0.2

Start from the accepted Round 0.1 commit. Add Cloudflare Env declarations for
the three existing `OPENAI_*` variables, add `typecheck`, `test:core`, and
`verify` package scripts, then prove that `npm run verify` detects a TypeScript
failure and passes again after the failure is removed.

Do not update dependencies, change product logic, configure D1, or add CI in
Round 0.2. Those changes have their own bounded rounds.

## Required checkpoint format

Every later round must report status, elapsed budget, changed files, exact
verification commands, proven acceptance criteria, unfinished work, risks,
next branch/commit/command, merge readiness, and deployment readiness.
