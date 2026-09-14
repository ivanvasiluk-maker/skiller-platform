# SKILLER — Round 1.2 checkpoint

Status: implemented locally  
Scope: D1-backed outcome-aware recommendation

## Delivered

- the web adapter reads the latest outcome only for the same user, situation
  kind, and currently eligible base skill;
- completed attempts with helpfulness 6 or higher receive
  `repeat_helpful`;
- failed attempts receive a one-step, maximum 60-second resize;
- helpfulness 3 or lower, or increased avoidance, selects a deterministic
  active alternative instead of repeating the low-fit skill;
- attempts without an outcome never count as successful evidence;
- every situation and trainer plan stores `decision_reason_code` and
  `decision_version`;
- `skill_recommended`, resize, and replace events include the same audit fields;
- one shared JSON fixture suite verifies that Python core and the TypeScript
  adapter produce identical policy decisions;
- migration `0005` and the isolated D1 smoke gate verify the new columns.

## Safety and eligibility

Safety still runs before outcome history. A history-based repeat is considered
only when the current deterministic selector independently chooses the same
skill for the current context. The selected catalog row must remain active.

## Deliberate boundary

Cross-context `transfer`, prerequisites/contraindications schema expansion,
Day 2–7 continuity, UI work, Google Sheets, production D1 operations, and
deployment are outside this round.

## Verification

```bash
npm run test:core
npm run test:d1
npm run verify
```
