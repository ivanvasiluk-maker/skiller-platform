/**
 * Preserve an action already formulated by the user. The Skill Engine still
 * selects the intervention; this text is only the human-facing agreement and
 * open-loop reminder.
 */
export function concreteActionFromText(text: string): string | null {
  const compact = text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const match = compact.match(
    /(?:мне\s+)?(?:надо|нужно|хочу|планирую|собираюсь)\s+(.+?)(?:\s*,?\s+(?:но|а\s+я|потому\s+что|хотя)(?=\s|$)|$)/i,
  );
  const candidate = (match?.[1] ?? "").trim();
  if (candidate.length < 5 || candidate.length > 160) return null;
  return candidate.charAt(0).toLocaleUpperCase("ru") + candidate.slice(1);
}
