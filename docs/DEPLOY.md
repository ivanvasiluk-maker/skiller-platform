# Деплой на Cloudflare — checklist секретов и шагов

Одноразовая настройка. Значения не коммитятся; имена и назначение — в
[ENVIRONMENT.md](ENVIRONMENT.md).

## 0. Предусловия

- Аккаунт Cloudflare с доступом Workers + D1;
- `npm run verify` зелёный локально;
- `wrangler login` выполнен (`npx wrangler login`).

## 1. Создать production D1

```bash
npx wrangler d1 create skiller-d1-prod
```

Скопируйте `database_id` из вывода.

## 2. Заполнить `wrangler.production.jsonc`

Замените плейсхолдеры (файл в `.gitignore`-подобном статусе не нужен —
реальные id не являются секретами, но не публикуйте их осознанно):

| Поле | Где взять |
|---|---|
| `d1_databases[0].database_id` | вывод `wrangler d1 create` |
| `d1_databases[0].database_name` | `skiller-d1-prod` |
| `vars.GOOGLE_SHEETS_SPREADSHEET_ID` | Необязательный ID Google-таблицы-зеркала. Без него приложение работает, а `/api/export` возвращает 503. |

Проверка конфига (откажет при незаполненном/невалидном D1 identity; Sheets ID необязателен):

```bash
npm run deploy:check
```

## 3. Задать секреты (не в файле, через secret store)

```bash
npx wrangler secret put OPENAI_API_KEY --config wrangler.production.jsonc
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON --config wrangler.production.jsonc
npx wrangler secret put EXPORT_CRON_SECRET --config wrangler.production.jsonc
```

| Секрет | Назначение |
|---|---|
| `OPENAI_API_KEY` | Ответы тренеров и разбор ситуации. Без него работает deterministic fallback. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON service account с доступом к таблице (`client_email`, `private_key`). |
| `EXPORT_CRON_SECRET` | Bearer для `POST /api/export`. |

## 4. Деплой

```bash
npm run deploy
```

Скрипт: `build` → `d1 migrations apply --remote` → `wrangler deploy`.
Пауза 5 секунд перед стартом — точка отмены.

## 5. Smoke развёрнутой версии

После деплоя, на живом URL:

1. открыть главную — рендерится без CSP-ошибок в консоли;
2. пройти onboarding (имя → тренер → ситуация → согласие);
3. подобрать шаг, начать, отметить результат;
4. `POST /api/export` с `Authorization: Bearer $EXPORT_CRON_SECRET` — 200, в таблице появились строки без email/имён/текстов;
5. `npm run pilot:metrics` против prod D1 — retention считается.

## 6. Rollback

```bash
npx wrangler rollback --config wrangler.production.jsonc
```

Миграции D1 не откатываются автоматически — перед деструктивной миграцией
снимайте бэкап (`wrangler d1 export`).
