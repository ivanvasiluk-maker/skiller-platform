import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getRawDb } from "@/db";
import { createGroupRequest, groupEligibility, GROUP_DDL } from "@/lib/group-requests";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";
export const dynamic = "force-dynamic";
function enabled() { return (env as unknown as { SKILLER_GROUP_OFFER_ENABLED?: string }).SKILLER_GROUP_OFFER_ENABLED === "1" && Boolean((env as unknown as { GROUP_REQUESTS_ADMIN_SECRET?: string }).GROUP_REQUESTS_ADMIN_SECRET) && (env as unknown as { SKILLER_MAINTENANCE?: string }).SKILLER_MAINTENANCE !== "1"; }
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  try {
    if (!enabled() || !await groupEligibility(getRawDb(), user.userId)) return Response.json({ eligible: false }, { headers: { "Cache-Control": "no-store" } });
    await getRawDb().prepare(GROUP_DDL).run();
    const request = await getRawDb().prepare("SELECT id,status,amount_eur FROM group_requests WHERE user_id=? AND offer_id='adhd-adults' ORDER BY created_at DESC LIMIT 1").bind(user.userId).first();
    return Response.json({ eligible: true, request }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return boundaryResponse(error); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  if (!enabled()) return Response.json({ error: "Заявки пока закрыты" }, { status: 503 });
  try { return Response.json(await createGroupRequest(getRawDb(), user.userId, await (await boundedRequest(request, 2000)).json()), { status: 202, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return boundaryResponse(error); }
}
