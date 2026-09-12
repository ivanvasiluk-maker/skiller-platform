import { getChatGPTUser } from "@/app/chatgpt-auth";
import { draftOnboardingGoal, OpenAIRequestError, transcribeAudio } from "@/lib/situation-analysis";
import { completeAttempt, completeDelayedCheckIn, completeOnboarding, confirmSituationChain, deleteSituation, recommendSkill, startAttempt, updateAccess } from "@/lib/skiller-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Требуется вход" }, { status: 401 });

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      if (String(form.get("action") ?? "") === "transcribe") {
        const file = form.get("audio");
        if (!(file instanceof File)) return Response.json({ error: "Добавьте аудиозапись" }, { status: 400 });
        return Response.json(await transcribeAudio(file));
      }
      return Response.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "onboardingDraft") {
      return Response.json({ draft: await draftOnboardingGoal(String(body.story ?? "")) });
    }
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
    if (body.action === "confirmChain") {
      return Response.json(await confirmSituationChain(user, {
        situationId: String(body.situationId ?? ""),
        confirmedText: String(body.confirmedText ?? ""),
        chain: body.chain as never,
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
        completed: Boolean(body.completed),
        reliefDelta: Number(body.reliefDelta ?? 0),
        goalProgress: Number(body.goalProgress ?? 0),
        helpfulness: Number(body.helpfulness ?? 0),
        avoidance: Boolean(body.avoidance),
        note: String(body.note ?? ""),
      }));
    }
    if (body.action === "delayedComplete") {
      return Response.json(await completeDelayedCheckIn(user, {
        attemptId: String(body.attemptId ?? ""),
        goalProgress: Number(body.goalProgress ?? 0),
        helpfulness: Number(body.helpfulness ?? 0),
        avoidance: Boolean(body.avoidance),
        note: String(body.note ?? ""),
      }));
    }
    if (body.action === "onboarding") {
      return Response.json(await completeOnboarding(user, {
        focus: String(body.focus ?? ""),
        goal: String(body.goal ?? ""),
        practiceStyle: String(body.practiceStyle ?? "short"),
        supportMode: String(body.supportMode ?? "solo"),
        safetyAcknowledged: Boolean(body.safetyAcknowledged),
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
    if (body.action === "deleteSituation") {
      return Response.json(await deleteSituation(user, String(body.situationId ?? "")));
    }
    return Response.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить данные";
    if (error instanceof OpenAIRequestError) {
      return Response.json({ error: message, openai: { status: error.status, code: error.code } }, { status: error.status ?? 502 });
    }
    console.error("SKILLER API error", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
