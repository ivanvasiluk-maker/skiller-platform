// Cron/manual trigger экспорта export_queue → Google Sheets.
// Защищён Bearer-секретом EXPORT_CRON_SECRET; секреты Google берутся из bindings/env
// и никогда не попадают в client bundle или Git.

import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";
import { createGoogleSheetsTransport, getGoogleAccessToken } from "@/lib/google-sheets";
import { runSheetsExport } from "@/lib/sheets-exporter";

export const dynamic = "force-dynamic";

type ExportEnv = {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SHEETS_SPREADSHEET_ID?: string;
  EXPORT_CRON_SECRET?: string;
};

export async function POST(request: Request) {
  const secrets = env as unknown as ExportEnv;
  if (!secrets.EXPORT_CRON_SECRET) {
    return Response.json({ error: "Экспорт не настроен" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secrets.EXPORT_CRON_SECRET}`) {
    return Response.json({ error: "Недопустимый секрет" }, { status: 403 });
  }
  if (!secrets.GOOGLE_SERVICE_ACCOUNT_JSON || !secrets.GOOGLE_SHEETS_SPREADSHEET_ID) {
    return Response.json({ error: "Google Sheets bindings не настроены" }, { status: 503 });
  }
  try {
    const key = JSON.parse(secrets.GOOGLE_SERVICE_ACCOUNT_JSON);
    const accessToken = await getGoogleAccessToken(key);
    const transport = createGoogleSheetsTransport({
      spreadsheetId: secrets.GOOGLE_SHEETS_SPREADSHEET_ID,
      accessToken,
    });
    const result = await runSheetsExport(getRawDb(), transport);
    return Response.json(result);
  } catch (error) {
    // Сбой экспорта не должен влиять на пользователей — только логируем.
    return Response.json(
      { error: error instanceof Error ? error.message : "Экспорт не удался" },
      { status: 502 },
    );
  }
}
