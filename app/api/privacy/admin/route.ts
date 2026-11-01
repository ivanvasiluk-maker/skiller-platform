import { z } from "zod";
import { env } from "cloudflare:workers";
import { getRawDb } from "@/db";
import { PRIVACY_DDL, purgeAccount } from "@/lib/privacy-data";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";
export const dynamic = "force-dynamic";
function authorized(request: Request) {
  const key = (env as unknown as { PRIVACY_ADMIN_SECRET?: string }).PRIVACY_ADMIN_SECRET;
  return Boolean(key && request.headers.get("authorization") === `Bearer ${key}`);
}
export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  await getRawDb().prepare(PRIVACY_DDL).run();
  const rows = await getRawDb().prepare("SELECT id,user_id,pseudonym,status,created_at FROM privacy_requests WHERE status='requested' ORDER BY created_at LIMIT 100").all();
  return Response.json(rows.results, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Нет доступа" }, { status: 403 });
  try {
    const body = z.object({ id: z.string().uuid(), confirmation: z.literal("PURGE_VERIFIED"), mirrorsVerified: z.boolean() }).strict().parse(await (await boundedRequest(request, 1000)).json());
    if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id) || body.confirmation !== "PURGE_VERIFIED") throw new Error("Подтвердите запрос.");
    return Response.json(await purgeAccount(getRawDb(), body.id, {
      maintenance: (env as unknown as { SKILLER_MAINTENANCE?: string }).SKILLER_MAINTENANCE === "1",
      mirrorsVerified: body.mirrorsVerified === true,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return boundaryResponse(error); }
}
