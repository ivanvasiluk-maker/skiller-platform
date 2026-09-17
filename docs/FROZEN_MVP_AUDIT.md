# SKILLER Frozen MVP Audit

Дата: 2026-09-12 (обновлено 2026-09-17 после Rounds 1.1–5.4)  
Источник требований: `SKILLER — FROZEN MVP SPEC v1.0 — 12.09.2026`

## Итог

Все технические этапы 0–5 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) закрыты. Frozen scope запрещает до завершения теста полноценный кабинет терапевта, marketplace, realtime voice, сложную геймификацию и расширение всей базы навыков. Остались внешние этапы: браузерный QA, реальный деплой со smoke, moderated pilot 5 человек и когорта 20–30.

## Definition of Done

| Пункт | Статус | Что подтверждено / чего не хватает |
|---|---|---|
| A. Онбординг и 3 персонажа | Реализовано | Марша, Бек и Скинни выбираются и сохраняются (Round 5.1 `/onboarding-flow`). |
| B. Character Bible | Реализовано | Версионируемая Bible для трёх, allowed/forbidden moves, сценарные unit-тесты + adversarial safety (Round 4.1). |
| C. Ситуация → микро-действие | Реализовано | Safety gate, детерминированный Skill Engine и 8 allowlisted навыков. |
| D. Outcome влияет на предложения | Реализовано | Outcome-policy v2 + D1 evidence; reason codes repeat/transfer/resize/replace сохраняются и объясняются (Rounds 1.1–2.9, 5.2 `/adjustment-cycle`). |
| E. Day 2 помнит Day 1 | Реализовано | Continuity Day 2: lastOutcome указывает на план Day 1, return_D2 (Rounds 2.2, 5.3 `/week-cycle`). |
| F. Grounded Day 3 recap | Реализовано | Recap из сохранённых попыток без выдуманных причин; цитирует точную полезность (Rounds 2.3, 5.3). |
| G. Days 4–7 repeat/transfer/replacement | Реализовано | repeat_helpful, transfer_helpful из другого контекста, resize/replace — полный цикл (Rounds 2.4a–2.5, 5.2–5.3). |
| H. Day 7 recap | Реализовано | Недельный recap по реальным попыткам и engaged days, рабочая гипотеза (Rounds 2.5, 5.3). |
| I. Free Talk | Реализовано | Ограниченный ответ, один вопрос, управляемые переходы, guard и deterministic fallback (Rounds 4.1, 5.1). |
| J. Safety отдельно от персонажа | Реализовано | Риск проверяется до AI и блокирует практику; персонаж-независим (Rounds 4.1, 5.1 `/safety-cycle`). |
| K. Смена режима/персонажа | Реализовано | Настройки меняются без удаления progress/memory (Rounds 2.7, 5.3). |
| L. Backend events | Реализовано | 32 события event-schema-v2, все версионированы (Rounds 3.1, 5.1). |
| M. Google Sheets mirror | Реализовано | Экспорт с retry/backoff, dedupe, минимизация payload; 503 не влияет на API (Rounds 3.2, 5.1). |
| N. Ручной расчет метрик | Реализовано | Cohort attribution, D2/D3/D7 retention и completion через `pilot:metrics`, reconcile (Round 3.1). |
| O. Quality gates | Реализовано | `build`, `tsc`, `lint`, 72 unit + D1 smoke + 14 integration проходят; CI verify.yml (Rounds 5.4–5.5). |
| P. E2E Day 1→7 | Реализовано | reload/restart/fallback E2E через `/week-cycle`; при отключенном OpenAI — детерминированные fallback'и (Round 5.3). Остался браузерный mobile/desktop прогон. |
| Q. Тест на 5 людях | Внешний этап | Нет результатов moderated pilot. |
| R. Когорта 20–30 | Внешний этап | Запускается после технического DoD и исправления blockers. |

## Исправлено в этом проходе

- выполнение действия теперь хранится независимо от оценки полезности;
- неудачная попытка сохраняется как attempt и не увеличивает completions;
- failed attempt не создает delayed check-in;
- средние outcome-метрики считаются по попыткам, как в доменном Python-ядре;
- добавлена миграция `outcomes.completed` с совместимостью старых данных;
- исправлен блокирующий production build JSX в `PlanCard`;
- устранены строгие TypeScript и ESLint ошибки.

## Следующий приоритет

Все технические приоритеты закрыты (Rounds 1.1–5.4). Остаются внешние этапы:

1. Браузерный QA: mobile/desktop без перекрытий + accessibility (keyboard, focus, labels, contrast).
2. Реальный деплой на Cloudflare + smoke test развернутой версии.
3. Moderated pilot 5 человек (Этап 6, волна 1).
4. Когорта 20–30 на 7 дней (Этап 6, волна 2).

## Проверки

- `npm run build` — успешно;
- `npx tsc --noEmit` — успешно;
- `npm run lint` — успешно (изменённые файлы; 49 ошибок только в генерируемых .wrangler/tmp бандлах);
- `npm run test:core` — 72/72 unit успешно;
- `npm run test:d1` — D1 smoke, идемпотентность миграций, rollback-проба;
- `npm run test:integration` — 14 D1-сценариев включая E2E week Day 1–7;
- `npm run verify` — полная цепочка lint + typecheck + test:core + test:d1 + test:integration + build.
