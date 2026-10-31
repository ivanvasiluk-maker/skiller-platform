import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";
import { GROUP_DDL, updateGroupRequest } from "@/lib/group-requests";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";
export const dynamic = "force-dynamic";
function authorized(request: Request) {
  const key = (env as unknown as { GROUP_REQUESTS_ADMIN_SECRET?: string }).GROUP_REQUESTS_ADMIN_SECRET;
  return Boolean(key && request.headers.get("authorization") === `Bearer ${key}`);
}
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  await getRawDb().prepare(GROUP_DDL).run();
  const rows = await getRawDb().prepare("SELECT id,offer_id,contact,status,amount_eur,created_at FROM group_requests ORDER BY created_at DESC LIMIT 100").all();
  return Response.json(rows.results, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  try { return Response.json(await updateGroupRequest(getRawDb(), await (await boundedRequest(request, 2000)).json()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return boundaryResponse(error); }
}
