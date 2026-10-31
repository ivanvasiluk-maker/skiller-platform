# S01 Integrated release candidate

The candidate combines the latest readiness implementation (6578549), the conversation-first fixes from PR 38, and the published character assets and visual styles from ffdaac9. It does not publish to production or change production data.

## Behavior

- Direct requests receive a concrete step without mandatory hypothesis confirmation. Outcomes require an explicitly reported attempt. Existing communication preferences and safety boundaries remain in place.
- Character behavior is version 1.2; integration expectations now match that version. Existing image assets render in the trainer selector and conversation instead of placeholder symbols. The published three-tab navigation is restored without removing the readiness privacy/group flows. Preparation of new character variants remains S04.
- Migration 0020 bridges the published `_v2` memory namespace and the GitHub namespace. It creates missing tables, copies into the namespace used by this candidate and retains both sources. Existing canonical rows win ID/analysis conflicts; retained source records are not removed. Account erasure covers both namespaces.

## Upgrade and recovery

1. Before production release, snapshot the database and its migration ledger; verify restore into an isolated copy. Do not edit, delete or renumber previously applied migration records.
2. Apply the full candidate migration set to that copy. Both historical paths must reach 0020. A published database may have recorded a differently named 0017; preserve that record and let the migration runner apply missing filenames. Confirm the actual ledger before using this procedure.
3. Compare per-user counts and representative memory records in both namespaces. Investigate collisions retained in `_v2`; do not assume total counts should be summed. Incompatible source schemas must block rollout for explicit reconciliation, not be dropped or rewritten.
4. Check conversational recall, settings continuity, erasure of both namespaces and isolation of another account. Only then plan the production migration and exact release SHA.
5. Bridge rollback is additive: retained source namespaces remain available. Do not drop migrated tables to roll back application code. Restore the verified snapshot if a database rollback is needed; distinguish writes made after that snapshot.

## Validation

- `npm run verify`: passed on the integrated working tree (lint, typecheck, 18 Python tests, Node tests, isolated D1 smoke/integration, build and HTTP acceptance).
- SQLite regression exercises published-only, GitHub-only and mixed histories, idempotent application and conflict retention. D1 integration verifies erasure of retained namespaces and preservation of another user.
- Browser acceptance additionally decodes all three approved portraits, then follows existing practice, group and privacy flows at 360/390/1280 px. Its actual result is recorded in the PR.
- AI is disabled in automated acceptance. Live model quality, microphone capture on real phones, production backup restoration, actual production bindings and external auto-deploy settings remain release acceptance items.

S01 is a candidate for review. It does not close S02, live acceptance or the MVP release gate. No merge, deployment, real payment or production migration is part of this change.
