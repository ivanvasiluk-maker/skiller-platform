import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getRawDb } from "@/db";
import { listReminders, reminderCommand, exportReminders } from "@/lib/reminders";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";
import { PrivacyError } from "@/lib/privacy-data";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function settings() {
  const flags = env as unknown as { SKILLER_REMINDERS_DISABLED?: string; SKILLER_TASKS_DISABLED?: string; SKILLER_MAINTENANCE?: string };
  if (flags.SKILLER_REMINDERS_DISABLED === "1" || flags.SKILLER_TASKS_DISABLED === "1" || flags.SKILLER_MAINTENANCE === "1") throw new PrivacyError(503, "Напоминания временно недоступны.");
}
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401, headers });
  try { settings(); if (new URL(request.url).searchParams.get("export") === "1") return Response.json(await exportReminders(getRawDb(), user.userId), { headers: { ...headers, "Content-Disposition": 'attachment; filename="skiller-reminders.json"' } }); return Response.json(await listReminders(getRawDb(), user.userId), { headers }); }
  catch (error) { return boundaryResponse(error); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401, headers });
  try { const bounded = await boundedRequest(request, 1500); settings(); return Response.json(await reminderCommand(getRawDb(), user.userId, await bounded.json()), { headers }); }
  catch (error) { return boundaryResponse(error); }
}
