# SKILLER Platform

SKILLER is a system for personalized practice of psychological skills. It helps a person test skills in real situations, measure the result, and gradually build an individual protocol. A psychologist can review the evidence and adjust the route when the user grants access.

This repository is the clean platform core. The existing Telegram bot [`ivanvasiluk-maker/adhdbot-FXrk`](https://github.com/ivanvasiluk-maker/adhdbot-FXrk) is a product and UX reference, not the codebase to extend indefinitely.

## Frozen product invariant

Every meaningful feature must strengthen this loop:

`situation -> behavior chain -> change point -> skill -> action -> outcome -> repetition -> learning -> personal map`

SKILLER is a skills trainer. It is not an AI psychologist, a diagnostic service, a replacement for psychotherapy, or an emergency service.

## What exists now

The first channel-independent vertical slice is implemented:

1. A structured situation enters the system.
2. The deterministic safety policy runs before recommendation.
3. The protocol engine selects an eligible skill from the registry.
4. A skill attempt is created.
5. Immediate effect, delayed effect, goal progress, execution cost, and avoidance are recorded.
6. The learning engine updates the user's personal skill map.

The first mobile web interface is available in `dist/`. It is a dependency-free
PWA prototype with five connected product surfaces and a working practice flow.

The LLM is intentionally outside the clinical decision path. It can later formulate questions and adapt language, but it cannot bypass safety or invent skills.

## Run tests

```bash
PYTHONPATH=src python -m unittest discover -s tests -v
```

## Open the first screens

Serve the repository root with any static server and open `dist/index.html`.
The prototype stores demonstration progress only in the current browser.

## Repository map

- `docs/PRODUCT_BIBLE.md` — frozen product rules used in code review.
- `docs/INFORMATION_ARCHITECTURE.md` — first screen and workflow map.
- `src/skiller/safety` — deterministic safety gate.
- `src/skiller/skills` — versioned skill registry.
- `src/skiller/application` — full practice cycle orchestration.
- `src/skiller/learning` — N-of-1 personal protocol updates.
- `tests` — product-invariant tests.

## Next build slice

Expose the cycle through an API and build a clickable user flow with five surfaces: Today, Help now, Practice, My protocol, and Psychologist access. The interface can change; the frozen loop cannot.
