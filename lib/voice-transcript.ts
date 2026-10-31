const ONLY_NON_WORDS = /^[\p{P}\p{S}\p{N}\s_]+$/u;
const KNOWN_EMPTY_TRANSCRIPTS = new Set([
  "эмодзи",
  "emoji",
  "смайлик",
  "тишина",
  "пусто",
  "...",
]);

/**
 * Speech-to-text sometimes hallucinates a symbol or a single service word for
 * silence. Such output must never enter the conversation as a user message.
 */
export function meaningfulVoiceTranscript(value: string): string | null {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || ONLY_NON_WORDS.test(text)) return null;
  if (KNOWN_EMPTY_TRANSCRIPTS.has(text.toLocaleLowerCase("ru"))) return null;
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return letters >= 2 ? text : null;
}

