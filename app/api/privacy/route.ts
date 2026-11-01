import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getRawDb } from "@/db";
import { privacyStatus, requestErasure } from "@/lib/privacy-data";
import { boundedRequest, boundaryResponse } from "@/lib/request-boundary";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  return Response.json({ request: await privacyStatus(getRawDb(), user.userId) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const body = z.object({ confirmation: z.literal("УДАЛИТЬ") }).strict().parse(await (await boundedRequest(request, 1000)).json());
    if (body.confirmation !== "УДАЛИТЬ") return Response.json({ error: "Введите УДАЛИТЬ для подтверждения." }, { status: 400 });
    return Response.json({ request: await requestErasure(getRawDb(), user.userId), message: "Запрос принят. Очистка ещё не завершена; новые записи приостановлены." },
      { status: 202, headers: { "Cache-Control": "no-store", "Set-Cookie": "__Host-skiller_guest=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
  } catch (error) { return boundaryResponse(error); }
}
