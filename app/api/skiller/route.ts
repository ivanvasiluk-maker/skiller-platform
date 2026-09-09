import { getChatGPTUser } from "@/app/chatgpt-auth";
import { completeAttempt, recommendSkill, startAttempt, updateAccess } from "@/lib/skiller-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });

  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "recommend") {
      return Response.json(await recommendSkill(user, {
        kind: String(body.kind ?? "other"),
        description: String(body.description ?? ""),
        firstSignal: String(body.firstSignal ?? "emotion"),
        actionUrge: String(body.actionUrge ?? "pause"),
        desiredDirection: String(body.desiredDirection ?? "goal"),
        importantGoal: String(body.importantGoal ?? ""),
        intensity: Number(body.intensity ?? 5),
        risk: String(body.risk ?? "unknown"),
      }));
    }
    if (body.action === "start") {
      return Response.json(await startAttempt(user, {
        skillId: String(body.skillId ?? ""),
        situationId: body.situationId ? String(body.situationId) : undefined,
        mode: String(body.mode ?? "practice"),
      }));
    }
    if (body.action === "complete") {
      return Response.json(await completeAttempt(user, {
        attemptId: String(body.attemptId ?? ""),
        reliefDelta: Number(body.reliefDelta ?? 0),
        goalProgress: Number(body.goalProgress ?? 0),
        helpfulness: Number(body.helpfulness ?? 0),
        avoidance: Boolean(body.avoidance),
        note: String(body.note ?? ""),
      }));
    }
    if (body.action === "access") {
      return Response.json(await updateAccess(user, {
        sharingEnabled: Boolean(body.sharingEnabled),
        shareProtocol: Boolean(body.shareProtocol),
        shareAttempts: Boolean(body.shareAttempts),
        shareNotes: Boolean(body.shareNotes),
      }));
    }
    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить данные";
    console.error("SKILLER API error", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
