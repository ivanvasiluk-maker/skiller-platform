# ADR 0001: Keep the product core channel-independent

## Status

Accepted.

## Context

The reference product is a Telegram bot whose main module grew very large. SKILLER must later support a web/mobile interface, a psychologist cabinet, and booking without duplicating clinical logic.

## Decision

Safety, skill eligibility, protocol selection, outcome measurement, and learning live in a pure Python domain core. Telegram, web, mobile, LLM, and booking are adapters around it.

## Consequences

- A channel cannot bypass the safety gate.
- The same attempt and outcome model serves Help now and Practice.
- LLM output is never the source of a skill definition or clinical rule.
- Interface experiments do not rewrite the personal protocol logic.

