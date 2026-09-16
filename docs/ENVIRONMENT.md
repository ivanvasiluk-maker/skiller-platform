# Обязательные env и Cloudflare bindings

Без публикации секретов: только имена, назначение и место хранения.
Значения живут в Cloudflare secrets / локальном `.env` (в `.gitignore`) / секрет-хранилище.

## Runtime (production worker)

| Имя | Тип | Назначение |
|---|---|---|
| `DB` | D1 binding | Основная база. Production и test D1 физически разделены (см. `wrangler.test.jsonc` — фиксированный local-only test identity, защищён `scripts/d1-test-guard.mjs`). |
| `OPENAI_API_KEY` | secret | Ответы тренеров и разбор ситуации. При отсутствии/сбое работает deterministic fallback. Не должен попадать в client bundle — проверяется в release checklist. |

## Экспорт аналитики (Round 3.2)

| Имя | Тип | Назначение |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | secret | JSON ключа service account (`client_email`, `private_key`) с доступом к таблице-зеркалу. Используется только server-side в `app/api/export/route.ts`. |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | var | ID Google-таблицы с вкладками USERS, EVENTS, DAILY, FEEDBACK, COHORTS. |
| `EXPORT_CRON_SECRET` | secret | Bearer-токен для ручного/cron вызова `POST /api/export`. |

Локальный запуск экспорта: `SKILLER_EXPORT_URL` + `EXPORT_CRON_SECRET`,
см. `scripts/export-sheets.mjs`.

## Тестовая среда

- `SKILLER_ENV=test` — обязателен для seed/reset и любых операций с тестовой D1;
- тестовая D1: `skiller-d1-test` / `00000000-0000-4000-8000-000000000041`,
  только локальная (`--local --persist-to` во временную папку).

## Правила

- секреты не коммитятся и не логируются;
- экспорт в Sheets не содержит email, имён и текстов разговоров/заметок —
  только pseudonym, числовые оценки и технические поля (см. `lib/export-queue.ts`
  allowlist).
