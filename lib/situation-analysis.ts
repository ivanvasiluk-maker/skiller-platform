import { env } from "cloudflare:workers";

export type SituationChain = {
  context: string;
  vulnerability: string;
  trigger: string;
  thoughts: string;
  emotions: string;
  body: string;
  urges: string;
  actions: string;
  targetBehavior: string;
  immediateConsequences: string;
  laterConsequences: string;
  skillPoint: string;
  userWords: string;
  aiHypotheses: string;
};

export type SituationAnalysis = {
  summary: string;
  chain: SituationChain;
  clarifyingQuestion: string;
};

export type OnboardingGoalDraft = {
  focus: "start" | "emotions" | "relationships" | "impulses" | "loneliness";
  goal: string;
  recentEpisodePrompt: string;
};

type RecommendationInput = {
  kind: string;
  description: string;
  firstSignal: string;
  actionUrge: string;
  desiredDirection: string;
  importantGoal: string;
  intensity: number;
};

const chainProperties = {
  context: { type: "string" },
  vulnerability: { type: "string" },
  trigger: { type: "string" },
  thoughts: { type: "string" },
  emotions: { type: "string" },
  body: { type: "string" },
  urges: { type: "string" },
  actions: { type: "string" },
  targetBehavior: { type: "string" },
  immediateConsequences: { type: "string" },
  laterConsequences: { type: "string" },
  skillPoint: { type: "string" },
  userWords: { type: "string" },
  aiHypotheses: { type: "string" },
} as const;

const chainKeys = Object.keys(chainProperties);

const situationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "chain", "clarifyingQuestion"],
  properties: {
    summary: { type: "string" },
    chain: {
      type: "object",
      additionalProperties: false,
      required: chainKeys,
      properties: chainProperties,
    },
    clarifyingQuestion: { type: "string" },
  },
};

const onboardingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["focus", "goal", "recentEpisodePrompt"],
  properties: {
    focus: { type: "string", enum: ["start", "emotions", "relationships", "impulses", "loneliness"] },
    goal: { type: "string" },
    recentEpisodePrompt: { type: "string" },
  },
};

export class OpenAIRequestError extends Error {
  constructor(message: string, public status: number | null, public code: string | null) {
    super(message);
  }
}

export async function transcribeAudio(file: File): Promise<{ text: string }> {
  const apiKey = requireOpenAIKey();
  validateAudioFile(file);

  const form = new FormData();
  form.set("file", file, safeAudioFileName(file));
  form.set("model", process.env.OPENAI_TRANSCRIBE_MODEL || env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  form.set("language", "ru");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const data = (await readJson(response)) as { text?: unknown };
  if (!response.ok) throw toOpenAIError(response.status, data, "Не удалось расшифровать аудио");
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) throw new OpenAIRequestError("OpenAI вернул пустую расшифровку", response.status, "empty_transcript");
  return { text: text.slice(0, 4000) };
}

export async function draftOnboardingGoal(story: string): Promise<OnboardingGoalDraft | null> {
  const apiKey = getOpenAIKey();
  const cleaned = story.trim().slice(0, 3000);
  if (!apiKey || cleaned.length < 12) return null;

  return requestStructured<OnboardingGoalDraft>({
    apiKey,
    schema: onboardingSchema,
    schemaName: "onboarding_goal_draft",
    system:
      "Ты помогаешь SKILLER превратить общий рассказ пользователя в редактируемый черновик цели. " +
      "Не диагностируй, не делай клинических выводов и не выдумывай конкретный эпизод. " +
      "Выбери ближайший фокус из списка, сформулируй наблюдаемую цель и предложи короткую просьбу вспомнить один недавний эпизод.",
    user: cleaned,
    fallbackMessage: "Не удалось подготовить черновик цели",
  });
}

export async function analyzeSituation(input: RecommendationInput): Promise<SituationAnalysis | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey || process.env.SKILLER_AI_DISABLED === "1" || input.description.trim().length < 12) return null;

  return requestStructured<SituationAnalysis>({
    apiKey,
    schema: situationSchema,
    schemaName: "situation_analysis",
    system:
      "Ты помогаешь SKILLER бережно расшифровать конкретный эпизод пользователя. " +
      "Не ставь диагнозы, не оценивай риск, не назначай лечение и не выбирай навык. " +
      "Заполняй поведенческую цепочку: контекст, уязвимость, событие, мысли, эмоции, тело, побуждения, действия, последствия и место навыка. " +
      "Если телесные ощущения, эмоции, последствия или другие звенья не названы пользователем, в соответствующем поле пиши только «неизвестно». " +
      "Не добавляй «возможно» в поля фактов; предположения держи только в aiHypotheses. Отделяй слова пользователя от гипотез AI. Пиши по-русски, коротко и проверяемо.",
    user: JSON.stringify(input),
    fallbackMessage: "Не удалось разобрать ситуацию",
  });
}

function validateAudioFile(file: File) {
  const maxBytes = 8 * 1024 * 1024;
  const supported = new Set(["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/mp3", "audio/m4a", "audio/ogg"]);
  if (!file.size) throw new OpenAIRequestError("Запись пустая", null, "empty_audio");
  if (file.size > maxBytes) throw new OpenAIRequestError("Запись слишком большая: максимум 8 МБ", null, "audio_too_large");
  if (file.type && !supported.has(file.type)) throw new OpenAIRequestError(`Формат ${file.type} не поддерживается`, null, "unsupported_audio_type");
}

function safeAudioFileName(file: File) {
  const extensionByType: Record<string, string> = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/mp3": "mp3",
    "audio/m4a": "m4a",
    "audio/ogg": "ogg",
  };
  return `skiller-recording.${extensionByType[file.type] ?? "webm"}`;
}

async function requestStructured<T>({ apiKey, schema, schemaName, system, user, fallbackMessage }: {
  apiKey: string;
  schema: object;
  schemaName: string;
  system: string;
  user: string;
  fallbackMessage: string;
}): Promise<T | null> {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.timeout(12000),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini",
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: [{ type: "input_text", text: user }] },
        ],
        text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
        max_output_tokens: 1100,
        store: false,
      }),
    });

    const data = await readJson(response);
    if (!response.ok) throw toOpenAIError(response.status, data, fallbackMessage);
    const output = extractOutputText(data);
    if (!output) return null;
    const parsed = JSON.parse(output);
    if (schemaName === "situation_analysis" && (!parsed.chain || !chainKeys.every(key => typeof parsed.chain[key] === "string") || typeof parsed.summary !== "string" || typeof parsed.clarifyingQuestion !== "string")) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function extractOutputText(data: unknown): string {
  if (typeof data !== "object" || data === null) return "";
  if ("output_text" in data && typeof data.output_text === "string") return data.output_text;
  const output = "output" in data && Array.isArray(data.output) ? data.output : [];
  for (const item of output) {
    if (typeof item !== "object" || item === null || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content === "object" && content !== null && "text" in content && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function toOpenAIError(status: number, data: unknown, fallbackMessage: string) {
  const error = typeof data === "object" && data !== null && "error" in data ? data.error : null;
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
  const message = typeof error === "object" && error !== null && "message" in error && typeof error.message === "string" ? error.message : fallbackMessage;
  return new OpenAIRequestError(message, status, code);
}

function requireOpenAIKey() {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new OpenAIRequestError("OPENAI_API_KEY не найден на сервере", null, "missing_api_key");
  return apiKey;
}

function getOpenAIKey() {
  return process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || "";
}
