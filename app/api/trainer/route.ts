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
  return Response.json(await trainerState(user), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  try { const bounded = await boundedRequest(request, 10000); return Response.json(await trainerCommand(user, await bounded.json()), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return boundaryResponse(error); }
}
