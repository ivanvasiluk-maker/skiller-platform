# Round 2.9 — UI explanation from persisted decision reason

## User effect

The next-step card and the active plan show a separate “Почему такой шаг” explanation derived from the persisted `decision_reason_code`.

## Finding

`trainer_plans` already stored `decision_reason_code`, but `buildDays4to6` ignored it and recomputed a reason from `result` and `helpfulness`. That could make the UI disagree with the auditable saved decision and made `transfer_helpful` unreachable in continuity.

## Scope

- pass the persisted reason into continuity
- map every Frozen MVP reason code to neutral explanatory copy
- render the explanation on the Days 4–6 card and active plan
- preserve the existing safety gate
- prove with a deliberately conflicting fixture that outcome fields do not override the saved reason

## Acceptance

- `repeat_helpful`, `transfer_helpful`, `resize_after_failed`, `replace_low_fit`, and `first_try` each have explicit copy
- saved transfer renders a transfer action
- safety suppresses the card
- `npm run verify` passes

## Out of scope

Deployment, browser E2E, analytics, new decision codes, and policy changes.
