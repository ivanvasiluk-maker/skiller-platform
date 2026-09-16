// Ручной запуск экспорта против развёрнутого endpoint /api/export.
// Секреты берутся из окружения и никогда не коммитятся.
//
//   SKILLER_EXPORT_URL=https://<app>/api/export EXPORT_CRON_SECRET=... node scripts/export-sheets.mjs

const url = process.env.SKILLER_EXPORT_URL;
const secret = process.env.EXPORT_CRON_SECRET;

if (!url || !secret) {
  console.error("Требуются SKILLER_EXPORT_URL и EXPORT_CRON_SECRET (значения — из секрет-хранилища).");
  process.exit(2);
}

const response = await fetch(url, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});
const body = await response.text();
console.log("Sheets export:", response.status, body);
process.exit(response.ok ? 0 : 1);
