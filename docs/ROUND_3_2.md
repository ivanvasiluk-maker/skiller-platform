# SKILLER — Round 3.2 Google Sheets Mirror

Дата: 2026-09-16  
Этап: 3 — аналитика пилота (второй раунд).  
Деплой: не входит в раунд.

## Цель

Server-side экспорт событий пилота из D1 в Google Sheets mirror с доказанными
инвариантами приёмки: отсутствие дублей при повторной отправке, недоступность
Google API не влияет на пользовательский запрос, таблица не содержит email,
имён и текстов разговоров.

## Реализация

1. `lib/sheets-schema.ts` — вкладки USERS, EVENTS, DAILY, FEEDBACK, COHORTS:
   фиксированные колонки и чистые функции построения строк. FEEDBACK — только
   числовые оценки, тексты helped/annoyed не экспортируются.
2. `lib/google-sheets.ts` — минимальный клиент Sheets API v4 без googleapis:
   JWT RS256 через Web Crypto (service account), readFirstColumn / appendRows /
   rewriteTab / ensureHeader. Работает и в Workers, и в Node 22+.
3. `lib/sheets-exporter.ts` — `runSheetsExport`: claim batch → dedupe по
   event_id из листа EVENTS (повторная отправка не создаёт дубли) → append в
   EVENTS/FEEDBACK → upsert USERS → snapshot-перезапись DAILY/COHORTS
   агрегатами из D1 → mark sent. Любой сбой транспорта переводит порцию в
   failed с exponential backoff; после 8 попыток — dead-letter.
4. `lib/in-memory-sheets.ts` — in-memory transport для тестов.
5. `app/api/export/route.ts` — production trigger: `POST /api/export` с
   Bearer `EXPORT_CRON_SECRET`; Google-ключи только из env/bindings.
6. `scripts/export-sheets.mjs` — ручной запуск против развёрнутого endpoint.
7. `docs/ENVIRONMENT.md` — обязательные env/bindings без публикации секретов.

## Доказанные инварианты (D1 integration, `/sheets-export`)

- полный цикл: 3 события → EVENTS/USERS/DAILY/COHORTS заполнены, queue = sent;
- повторный прогон: очередь пуста, новых строк нет (no duplicates);
- приватный `text` из payload отсутствует в листе (privacy allowlist);
- «Google API 503»: событие → failed, attempts=1, retry_at задан;
- после восстановления API: retry доставляет событие, лист без дублей.

## Проверки

- unit: построение строк вкладок, privacy-отсечение текстов, in-memory
  transport (`tests/sheets-exporter.test.ts`);
- `npm run verify` зелёный: lint, typecheck, 59 unit, D1 smoke, D1
  integration, build.

## Не входит

- реальный боевой прогон против настоящей таблицы (нужны секреты и deploy);
- scheduled trigger (cron) — endpoint готов, расписание настраивается при деплое;
- privacy review перед боевым экспортом.

## Следующий малый раунд

Round 4.1 — Character Bible для Марши, Бека и Скинни (Этап 4).
