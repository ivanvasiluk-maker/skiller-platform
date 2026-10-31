# S02 Security and recovery verification

This increment builds on the S01 candidate (PR 43). It adds repeatable release checks, not a production deployment.

## Changed behavior

Group-request refusals and export refusals now consume a bounded request body before returning. This prevents a refused maintenance request from leaving the local Worker keep-alive connection unable to serve the next request. Body size and same-origin checks remain enforced; paused routes do not call external services or create product records.

## Automated evidence

- `npm run test:recovery`: migrates a disposable local D1, seeds two synthetic accounts, retained memory and an erasure request, exports a SQL snapshot and restores it into a second isolated D1. Compares all user-table columns and rows, including the migration ledger, checks the erasure request and other account's memory, and verifies migration reapplication. Both databases and the snapshot are removed afterward. The actual test binding is validated before any database command; all commands are local.
- `npm run test:http`: rejects forged identity on trainer, legacy, privacy and group APIs; checks ownership of a saved plan between two onboarded accounts; verifies private group requests and erasure statuses do not appear to another account. Group-administration and privacy-administration credentials are not interchangeable.
- `npm run test:maintenance`: runs the real built HTTP routes with maintenance enabled. Trainer and legacy writes, group requests and export return 503, trainer state does not perform lazy writes, and authorized owner review remains available with no-store responses. Direct inspection of the disposable database confirms no profile, plan or lead was created.
- Recovery and maintenance checks are included in `verify` and GitHub CI. Existing S01 deletion tests still verify fail-closed behavior for unknown owned tables, rollback on FK failure, both memory namespaces and preservation of another account.
- Existing deploy-boundary tests reject deployment without the explicit confirmation flag and reject deployment from CI even with that flag. The Verify workflow has no deployment job.

## Dependency hardening

The registry audit initially reported eight affected packages in the runtime dependency graph, including one critical finding. This is a dependency-graph finding, not proof that the deployed application's routes are exploitable. Next.js is pinned to 16.4.3 and Zod to 4.6.7; compatible transitive fixes are recorded in the lockfile. The coordinated build-tool update pins React/React DOM/RSC to 19.3.1, Vinext to 1.4.0, Vite to 8.3.5, the Cloudflare plugin to 1.66.0 and Wrangler to 4.156.0, with compatible worker types and RSC plugin.

Audit runtime and build dependencies separately: packages declared as dev dependencies can still contribute to the production bundle. Record unresolved advisories as release-review items rather than forcing incompatible major overrides or downgrades. Registry audit success only describes advisories known at the time of the check.

Sources: [Next.js maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [Zod migration guide](https://zod.dev/v4/changelog), npm registry audit and peer-dependency metadata checked 31.10.2026.

Final registry scan of this lockfile: no critical or high findings across the complete dependency graph; the runtime-only audit reports zero findings. The complete scan still reports 24 moderate graph entries, rooted in the minimatch, legacy esbuild and fflate advisories; these counts include affected parent chains, not 24 independent vulnerabilities. Their documented conditions concern glob amplification, the old development server and malformed ZIP64 input. Do not expose development servers or feed untrusted archives/configuration into these tools. This does not establish that every build dependency is irrelevant to runtime; remaining advisories require separate review. Suggested automatic downgrades of ESLint, Drizzle Kit and Vinext were not applied. `audit:runtime` now gates CI at high severity; a zero runtime audit is not a claim that the complete audit is clean.

## Release gates still requiring production evidence

| Gate | Current evidence | Remaining before release |
|---|---|---|
| Account boundary | Synthetic real HTTP and D1 tests | Confirm the chosen production ingress; do not enable trust in caller-supplied identity headers without a verified trusted boundary. |
| Data deletion | Local erasure, transaction rollback, scoped statuses and retained namespaces | Verify external mirrors, exports and managed backups for the real request; follow OWNER_ACCEPTANCE.md. |
| Backup recovery | Complete local D1 SQL export and restore rehearsal | Restore an authorized actual production backup into an isolated recovery environment, reconcile deletion requests made after that backup, and compare schema/data. No real backup was downloaded here. |
| Environment separation | Validated synthetic test binding and local-only commands | Verify the real deployed production D1 binding and ownership. Test configuration alone does not prove it. |
| Automatic publication | Workflow has no deploy job; CLI blocks CI deploy | Inspect external Cloudflare/Sites/GitHub-hook automation settings. The connected read capabilities do not establish all external settings. |
| Public release | S01 and S02 candidate checks | Live-model review, real phone/microphone acceptance, final data policy and approved release SHA with post-deploy smoke. |

Do not label these external gates complete based on local tests. No production records were read or changed, no real backup was exported, no external mirror was modified and no merge or deployment was performed.

## Recovery procedure

1. Stop product writes and all exporters. Preserve the real migration ledger and a verified backup; record the snapshot time.
2. Restore into an isolated environment with external AI, export, notifications and payment integrations disabled. Never use the production binding as the target of a rehearsal.
3. Compare schema, migration ledger and per-user records. Use the S01 migration reconciliation procedure for divergent histories.
4. Reconcile deletion requests and completed erasures since the snapshot before any restored dataset becomes live. A successful old snapshot restore must not resurrect deleted records into production.
5. Verify access boundaries and rollback, then make a separate controlled release decision. Local `test:recovery` is a reproducible rehearsal of the mechanism, not a substitute for this production evidence.
