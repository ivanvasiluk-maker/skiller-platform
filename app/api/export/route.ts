// Cron/manual trigger экспорта export_queue → Google Sheets.
// Защищён Bearer-секретом EXPORT_CRON_SECRET; секреты Google берутся из bindings/env
// и никогда не попадают в client bundle или Git.

import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";
import { createGoogleSheetsTransport, getGoogleAccessToken } from "@/lib/google-sheets";
import { runSheetsExport } from "@/lib/sheets-exporter";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";

export const dynamic = "force-dynamic";

type ExportEnv = {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SHEETS_SPREADSHEET_ID?: string;
  EXPORT_CRON_SECRET?: string;
};

export async function POST(request: Request) {
  // Consume a bounded body even on early refusal so keep-alive remains usable.
  try { await boundedRequest(request, 1000); }
  catch (error) { return boundaryResponse(error); }
  if ((env as unknown as { SKILLER_MAINTENANCE?: string }).SKILLER_MAINTENANCE === "1") return Response.json({ error: "Экспорт приостановлен" }, { status: 503 });
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
  } catch {
    // Сбой экспорта не должен влиять на пользователей — только логируем.
    return Response.json(
      { error: "Экспорт не удался. Повторите позже." },
      { status: 502 },
    );
  }
}
