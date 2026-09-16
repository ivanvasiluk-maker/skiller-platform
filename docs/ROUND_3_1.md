# SKILLER — Round 3.1 Pilot Analytics Foundation

Дата: 2026-09-16  
Этап: 3 — аналитика пилота (первый раунд).  
Деплой: не входит в раунд.

## Цель

Закрыть измеримость пилота на стороне D1 до подключения Google Sheets:
каждое событие должно попадать в cohort и очередь экспорта без влияния на
ответ пользователя.

## Реализация

1. `db` — миграция `0006_pilot_cohorts_export_queue.sql`:
   - `cohorts` — ключ cohort (`YYYY-MM-DD:product_version`), версия продукта;
   - `cohort_members` — привязка пользователя (pseudonym) к cohort, идемпотентная;
   - `export_queue` — `pending`/`processing`/`sent`/`failed`, `attempts`,
     `retry_at`, `last_error` с индексом по status/retry.
2. `lib/pilot-event-schema.ts` — единый реестр 27 обязательных событий Frozen
   Spec с обязательными payload-полями (`event-schema-v1`).
3. `lib/cohorts.ts` — cohort присваивается один раз при первом событии;
   ключ воспроизводим по сохранённым данным.
4. `lib/export-queue.ts` — enqueue (INSERT OR IGNORE по `export:<event_id>`),
   claim batch, exponential backoff 60s×2^n, dead-letter после 8 попыток,
   `minimizePayloadForExport` — allowlist аналитических ключей без текстов
   разговоров, заметок, email и имён.
5. `lib/pilot-events.ts` — `recordPilotEvent` атомарно пишет событие, cohort
   attribution и enqueue; batch-варианты для trainer settings.
6. `lib/trainer-data.ts` — все события тренера проходят через `recordPilotEvent`;
   DDL таблиц добавлен в `ensureTrainerStorage`.
7. `scripts/pilot-metrics.mjs` — `npm run pilot:metrics` считает D2/D3/D7
   engaged retention и action start/completion по cohort;
   `npm run pilot:reconcile` сверяет: у каждого события есть строка в очереди
   и `sent = exported_at`.

## Проверки

- unit: cohort key, минимизация payload, backoff, полнота event schema
  (`tests/pilot-analytics.test.ts`);
- D1 integration: `/pilot-analytics` — повторная запись события не создаёт
  дублей в queue и cohort, ключ cohort детерминирован;
- `npm run verify` зелёный (lint, typecheck, 55 unit, D1 smoke, D1
  integration, build).

## Не входит

- реальный append/upsert в Google Sheets (следующий раунд 3.2: worker с
  service account, вкладки USERS/EVENTS/DAILY/FEEDBACK/COHORTS);
- privacy review перед боевым экспортом;
- деплой.

## Следующий малый раунд

Round 3.2 — server-side Google Sheets exporter поверх `export_queue`:
claim batch → minimize → append в Sheets → mark sent, с тестом «недоступный
Google API не влияет на пользовательский запрос».
