import { getChatGPTUser } from "@/app/chatgpt-auth";
import { trainerCommand, trainerState } from "@/lib/trainer-data";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  return Response.json(await trainerState(user), { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });
  if (request.headers.get("origin") && new URL(request.headers.get("origin")!).origin !== new URL(request.url).origin) return Response.json({ error: "Недопустимый источник" }, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 10000) return Response.json({ error: "Слишком большой запрос" }, { status: 413 });
  try { return Response.json(await trainerCommand(user, await request.json())); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить. Обновите страницу." }, { status: 400 }); }
}
