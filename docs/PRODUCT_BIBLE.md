# SKILLER Product Bible v1.0 — engineering extract

Status: **frozen product invariant**. Interface, hypotheses, wording, and implementation may evolve. Changes to this file require an explicit product decision.

## Product definition

SKILLER is a personalized psychological skills practice system based on DBT, CBT, and compatible evidence-based approaches. It trains behavior in real situations and builds an individual map of what works, for whom, when, and toward which goal.

## Core loop

`situation -> behavior chain -> change point -> skill -> application -> measurement -> result -> repetition -> personal protocol`

The unit of value is not a viewed lesson, a completed card, or a chat response. It is a measured skill attempt in context that improves the next decision.

## Two user modes

- **Help now:** the person needs a tolerable, safe action in the current situation.
- **Practice:** the person learns and generalizes a skill before the next difficult situation.

Both modes write evidence to the same personal protocol.

## Parallel tracks

The system may combine skills from different protocols while preserving clinical hierarchy:

1. safety and stabilization;
2. foundational skills;
3. a current quality-of-life goal;
4. event-triggered help;
5. maintenance and generalization.

Protocol labels do not dictate a single linear course. Eligibility, prerequisites, contraindications, risk, and the user's goals determine the route.

## Outcome model

Immediate relief is insufficient evidence. Each attempt may measure:

- completion and fidelity;
- progress toward the chosen goal;
- immediate effect;
- delayed effect;
- effort or execution cost;
- possible reinforcement of avoidance;
- context and intensity;
- user feedback about fit.

Observed facts, system hypotheses, and psychologist conclusions must remain distinguishable.

## Roles

- The deterministic system owns safety rules, eligibility, prerequisites, versioning, and auditable decisions.
- AI may clarify a situation, adapt language, and explain a registered decision. It must not invent clinical policy.
- The user owns their data and access consent.
- A psychologist may review, assign, block, and correct a route within granted access.

## Stop signals

The product has drifted if it becomes primarily:

- an endless AI chat;
- a large library measured by content consumption;
- a generic mood tracker;
- a diagnostic or emergency service;
- a dashboard that adds unpaid work for psychologists;
- a recommender optimized only for short-term discomfort reduction.

