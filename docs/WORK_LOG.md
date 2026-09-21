# Журнал работы — обновлено 2026-09-21 (финал дня)

## Текущее состояние (точка восстановления)
Ветка `feat/conversation-relationship-layer`, HEAD `7490228`, чистое дерево, `npm run verify` → exit 0 (12 таблиц). Запушено на GitHub.

## Сделано 2026-09-21 (день 2)
- **Спринт 10**: orchestrator-instructions timeout → deterministic fallback в integration; safety/fallback не зависят от LLM (5/5 PASS).
- **Спринт 11**: PATCH 1.1 события (loop_id/outcome) экспортируются в Sheets, приватный текст не уходит (allowlist +loop_id/outcome); sheets-export тест расширен.
- **Спринт 12**: labels на capture-selects (htmlFor/id), responsive/mobile CSS (trainer-chip/composer/messages на ≤760px/≤480px). Build PASS.
- **Спринт 13 ч.3 (частично)**: production `database_id` заполнен (fdc386c6-094f-473a-8402-cc58d6cb5c37, skiller-d1-prod, создана 2026-09-17). `wrangler` залогинен (ivan.vasiluk@gmail.com). Production build PASS.

## БЛОКЕР деплоя
`GOOGLE_SHEETS_SPREADSHEET_ID` — отсутствует в репозитории/.env.local/docs. Это секрет/ID Google-таблицы-зеркала, должен предоставить владелец. Без него `npm run deploy:check` отказывает (по дизайну). Деплой невозможен до его получения.

## Что НЕ сделано
- **Спринт 14**: deploy + post-deploy smoke (ждёт GOOGLE_SHEETS_SPREADSHEET_ID).
- **Спринт 15**: финальная передача (PR, screenshots, rollback).
- Real-phone smoke (нужно физическое устройство).

## Как продолжить
1. Получить `GOOGLE_SHEETS_SPREADSHEET_ID` от владельца → вписать в `wrangler.production.jsonc` → `npm run deploy:check` → `npm run deploy`.
2. Задать секреты: `wrangler secret put OPENAI_API_KEY / GOOGLE_SERVICE_ACCOUNT_JSON / EXPORT_CRON_SECRET --config wrangler.production.jsonc`.
3. Post-deploy smoke по docs/DEPLOY.md §5.

---
# Журнал работы — обновлено 2026-09-21

## Текущее состояние (точка восстановления)
Ветка `feat/conversation-relationship-layer`, HEAD `5e774fb`, чистое дерево, `npm run verify` → exit 0. Запушено на GitHub (origin/feat/conversation-relationship-layer = 5e774fb).

## Сделано 2026-09-21 (продолжение)
- **Спринт 13 (часть 1)**: drizzle миграция `0007_open_loops.sql` + snapshot + journal; open_loops теперь через миграции (бриф §10 закрыт). D1 smoke: 10 таблиц.
- **Спринт 13 (часть 2)**: миграция `0008_relationship_memory.sql` — `success_factors` + `intervention_memory`; персистентная память пишется в ветках DONE/PARTIAL/NOT_DONE. D1 smoke: 12 таблиц.
- **Integration**: relationship-cycle расширен ассертами памяти (successFactorsStored=1, interventionPartial, interventionNotDone) — PASS.
- **Ручной UI smoke (desktop, localhost:5173)**: Day 1 → open loop → Day 2 follow-up banner + quick replies → inline intervention card → DONE ветка — всё подтверждено в браузере. Данные персистятся в D1 (проверено через sqlite).
- Snapshot-генератор: `scripts/build-snapshot-0007.mjs` (0007+0008).

## Что НЕ сделано
- **Спринт 10–12**: a11y/responsive QA чек-лист (desktop + real phone); analytics integrity новых событий в Sheets export.
- **Спринт 13 (часть 3)**: production migration rehearsal на копии production D1; secrets/env check; rollback plan.
- **Спринт 14**: deploy + post-deploy smoke (desktop + phone).
- **Спринт 15**: финальная передача (PR, логи, screenshots, rollback).
- Открытый вопрос UX: quick reply на уже-resolved loop молчит (guard `!plan.result`) — корректно, но подумать о повторном follow-up.

## Блокер (напоминание)
Контрольная ревизия 3d1b4e7 не существует нигде. Conversation-слой реализован заново по спецификации брифа — подтверждено владельцем.

## Ключевые файлы
- `lib/conversation-orchestrator.ts` (open loops + memory + orchestrator)
- `drizzle/0007_open_loops.sql`, `0008_relationship_memory.sql` + meta
- `lib/trainer-data.ts`, `lib/pilot-event-schema.ts` (47 событий)
- `app/trainer-app.tsx`, `app/trainer.css` (chat shell)
- `scripts/d1-integration-worker.ts`, `scripts/test-d1-integration.mjs`, `scripts/test-d1.mjs`, `scripts/build-snapshot-0007.mjs`
- `docs/AUDIT_2026_09_20.md`

## Как продолжить
1. `cd skiller-platform-main/skiller-platform-main; git checkout feat/conversation-relationship-layer; git pull`
2. `npm run verify` — подтвердить зелёное.
3. Спринт 10–12 (a11y/phone) или Спринт 13 ч.3 (production rehearsal) — по приоритету.

## Где остановились (восстановление завтра)
Работаем в `skiller-platform-main/skiller-platform-main`, ветка `feat/conversation-relationship-layer`.
HEAD: `1dcc979`. Всё закоммичено, рабочее дерево чистое. Все gates зелёные (`npm run verify` → exit 0).

## Сделано (спринты 0–9)
- **Спринт 0**: сверка GitHub (origin/main = 14a111f). Контрольные ревизии брифа 052e2e3/e158cee/3d1b4e7 НЕ существуют. Baseline закреплён тегом `baseline-14a111f` (запушен) + bundle.
- **Спринт 1**: аудит → `docs/AUDIT_2026_09_20.md` (20-требованная матрица).
- **Спринт 2**: conversation shell — typing indicator, quick replies, follow-up banner, online-статус, «Сегодня», Enter/Shift+Enter, autoscroll.
- **Спринты 3–4**: `lib/conversation-orchestrator.ts` — таблица `open_loops`, `buildConversationContext` (11 блоков), due loop приоритет; события conversation_started/follow_up_*/open_loop_created.
- **Спринты 5–8**: 4 ветки результата в trainer-data (done→success factor, partial→chain analysis, failed→missing link без автозамены, skill_rejected) + 15 новых событий в pilot-event-schema (registrySize 47).
- **Спринт 9**: voice parity — mic в trainer composer → transcribe → общий pipeline.
- **Фикс**: integration-тест изолирован от .env.local через `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` (блокер №3 закрыт).

## Тесты
- core: 72 pass · d1 smoke: PASS · integration: PASS (включая новый `relationship-cycle` Day1→Day2→4 ветки) · build: PASS · lint: 0 errors.

## Что НЕ сделано (завтра)
- **Спринт 10–12**: a11y/responsive QA чек-лист (desktop + real phone smoke); analytics data integrity re-check новых событий в Sheets export.
- **Спринт 13**: production hardening — migration `drizzle/0007_open_loops.sql` (сейчас open_loops создаётся runtime CREATE TABLE, НЕ миграцией — это нарушение брифа §10, надо перенести в drizzle migration).
- **Спринт 14**: deploy + post-deploy smoke.
- **Спринт 15**: финальная передача (PR, логи, screenshots, rollback).
- Решение владельца по потерянному 3d1b4e7 (мы реализовали слой заново по спецификации — подтверждено).

## Ключевые файлы изменений
- `lib/conversation-orchestrator.ts` (новый)
- `lib/trainer-data.ts`, `lib/pilot-event-schema.ts`, `lib/free-talk.ts`, `lib/situation-analysis.ts`
- `app/trainer-app.tsx`, `app/trainer.css`
- `scripts/d1-integration-worker.ts`, `scripts/test-d1-integration.mjs`
- `docs/AUDIT_2026_09_20.md`, `.gitignore`

## Важные технические факты
- wrangler 4.92 грузит `.env.local` с `override:true` → в тестах нужен `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`.
- open_loops сейчас через runtime CREATE TABLE в `ensureOpenLoopStorage()` — перенести в drizzle migration перед production.
- result enum расширен: done/failed/more/partial.
- Бандл прогресса: `work/skiller-conversation-layer-20260920.bundle`.

## Как продолжить завтра
1. `cd skiller-platform-main/skiller-platform-main; git checkout feat/conversation-relationship-layer`
2. `npm run verify` — убедиться, что всё ещё зелёное.
3. Начать со спринта 13 (миграция 0007_open_loops) ИЛИ со спринта 10–12 (a11y/phone smoke) — по приоритету.
