import { env } from "cloudflare:workers";
import { assertDataWritable } from "@/lib/privacy-data";
import { consumeUsage } from "@/lib/usage-limits";
import { getRawDb } from "@/db";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { trainerCommand, trainerState, trainerHistory } from "@/lib/trainer-data";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  const before = new URL(request.url).searchParams.get("before");
  if (before !== null) {
    try { return Response.json(await trainerHistory(user, before), { headers: { "Cache-Control": "no-store" } }); }
    catch { return Response.json({ error: "Не удалось загрузить более раннюю историю." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  }
  try { return Response.json(await trainerState(user), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return boundaryResponse(error); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  try { const bounded = await boundedRequest(request, 10000); await assertDataWritable(getRawDb(), user.userId, (env as unknown as { SKILLER_MAINTENANCE?: string }).SKILLER_MAINTENANCE === "1"); const body = await bounded.json() as { action?: string }; if (["message", "situation", "quickStop", "confirmMemory"].includes(body?.action ?? "")) await consumeUsage(getRawDb(), user.userId, request.headers.get("cf-connecting-ip")); return Response.json(await trainerCommand(user, body), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return boundaryResponse(error); }
}
