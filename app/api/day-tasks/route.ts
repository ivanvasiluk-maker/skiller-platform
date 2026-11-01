import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getRawDb } from "@/db";
import { listDayTasks, exportDayTasks, dayTaskCommand } from "@/lib/day-tasks";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";
import { PrivacyError } from "@/lib/privacy-data";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function enabled() {
  if ((env as unknown as { SKILLER_TASKS_DISABLED?: string }).SKILLER_TASKS_DISABLED === "1") throw new PrivacyError(503, "План дня временно недоступен.");
}
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401, headers });
  try {
    enabled();
    const query = new URL(request.url).searchParams;
    if (query.get("export") === "1") return Response.json(await exportDayTasks(getRawDb(), user.userId), { headers: { ...headers, "Content-Disposition": 'attachment; filename="skiller-day-tasks.json"' } });
    return Response.json(await listDayTasks(getRawDb(), user.userId, query.get("date") ?? ""), { headers });
  } catch (error) { return boundaryResponse(error); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401, headers });
  try {
    const bounded = await boundedRequest(request, 12000);
    enabled();
    return Response.json(await dayTaskCommand(getRawDb(), user.userId, await bounded.json(), (env as unknown as { SKILLER_MAINTENANCE?: string }).SKILLER_MAINTENANCE === "1"), { headers });
  } catch (error) { return boundaryResponse(error); }
}
