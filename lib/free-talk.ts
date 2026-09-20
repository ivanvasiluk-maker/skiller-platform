// Free Talk: генерация ответа тренера с Bible-driven инструкциями,
// Zod-валидацией структуры, пост-проверкой guardrails и deterministic fallback.
// fetch инъецируется для тестов и интеграционных сценариев (timeout/malformed/hostile).

import { z } from "zod";
import type { InteractionMode } from "./trainers.ts";
import {
  buildFreeTalkFallback,
  buildFreeTalkInstructions,
  getCharacterBible,
  validateTrainerReply,
} from "./character-bible.ts";
import { interactionModes, type TrainerId } from "./trainers.ts";

export type FreeTalkProfile = {
  trainer_id: TrainerId;
  interaction_mode: InteractionMode;
};

export type FreeTalkMessage = { role: "user" | "assistant"; text: string };

export async function produceFreeTalkReply(input: {
  profile: FreeTalkProfile;
  messages: FreeTalkMessage[];
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  /** PATCH 1.1: инструкции оркестратора (структурированный контекст). */
  instructionsOverride?: string;
}): Promise<string> {
  const bible = getCharacterBible(input.profile.trainer_id);
  const fallback = buildFreeTalkFallback(bible);
  // Модуль должен работать и в Node (Next runtime), и в чистом workerd
  // (интеграционный worker), где глобального process нет.
  const aiDisabled =
    typeof process !== "undefined" && process.env?.SKILLER_AI_DISABLED === "1";
  if (!input.apiKey || aiDisabled) return fallback;
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        store: false,
        max_output_tokens: 450,
        instructions:
          input.instructionsOverride ??
          buildFreeTalkInstructions(
            bible,
            interactionModes[input.profile.interaction_mode],
          ),
        input: input.messages.map((m) => ({ role: m.role, content: m.text })),
        text: {
          format: {
            type: "json_schema",
            name: "trainer_reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: { reply: { type: "string" } },
              required: ["reply"],
            },
          },
        },
      }),
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as {
      output?: { content?: { type?: string; text?: string }[] }[];
    };
    const output = data.output
      ?.flatMap((o) => o.content ?? [])
      .find((c) => c.type === "output_text")?.text;
    let parsedOutput: unknown = null;
    try {
      parsedOutput = output ? JSON.parse(output) : null;
    } catch {
      return fallback;
    }
    const parsed = z
      .object({ reply: z.string().min(1).max(1600) })
      .strict()
      .safeParse(parsedOutput);
    if (!parsed.success) return fallback;
    // Пост-проверка лимитов и клинических запретов: нарушение → fallback.
    const verdict = validateTrainerReply(parsed.data.reply);
    return verdict.ok ? parsed.data.reply : fallback;
  } catch {
    return fallback;
  }
}
