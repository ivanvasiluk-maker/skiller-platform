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

export type ConversationIntent = "direct_action_request" | "explore";
export type AttemptReport = "done" | "partial" | "not_done" | "question" | "refusal" | "unknown";

export function conversationIntent(text: string): ConversationIntent {
  const compact = text.replace(/\s+/g, " ").trim().toLowerCase();
  const asksForAction = /(?:что|как)\s+(?:мне\s+)?(?:сейчас\s+)?(?:делать|сделать|начать|успокоиться|не\s+сорваться)|помоги(?:те)?\s+(?:мне\s+)?начать/u.test(compact);
  const urgentAction = /(?:мне\s+)?нужно\s+(?:сделать|закончить|начать).{0,80}(?:сегодня|сейчас)|завтра\s+дедлайн/u.test(compact);
  return asksForAction || urgentAction ? "direct_action_request" : "explore";
}

export function extractShortTrigger(text: string): string {
  const compact = text.replace(/[«»"“”]/g, "").replace(/\s+/g, " ").trim();
  const firstClause = compact.split(/[.!?;]|,\s*(?:но|а|потому что|хотя)\s+/iu)[0]?.trim() ?? "";
  const words = firstClause.split(/\s+/).filter(Boolean).slice(0, 12);
  return words.length >= 3 ? words.join(" ") : "возникает эта ситуация";
}

export function classifyAttemptReport(text: string): AttemptReport {
  const compact = text.replace(/\s+/g, " ").trim().toLowerCase();
  const endsToken = "(?=\\s|$|[.!?,])";
  if (new RegExp(`^(?:не\\s+сделал(?:а)?|не\\s+попробовал(?:а)?|не\\s+начал(?:а)?|ничего\\s+не\\s+сделал(?:а)?)${endsToken}`, "u").test(compact)) return "not_done";
  if (new RegExp(`^(?:не\\s+буду|не\\s+хочу|шаг\\s+не\\s+подходит|это\\s+не\\s+подходит)${endsToken}`, "u").test(compact)) return "refusal";
  if (/^(?:частично|начал(?:а)?\s+и\s+(?:бросил(?:а)?|остановил(?:ась|ся))|открыл(?:а)?[^.]{0,80}\sно\s)/u.test(compact)) return "partial";
  if (new RegExp(`^(?:сделал(?:а)?|попробовал(?:а)?|получилось|закончил(?:а)?)${endsToken}`, "u").test(compact)) return "done";
  if (/\?$|^(?:что|как)\s+(?:это|его|её|мне)\s+/u.test(compact)) return "question";
  return "unknown";
}

export function missingLinkQuestion(text: string): string {
  const compact = text.toLowerCase();
  if (/youtube|ютуб|видео/u.test(compact)) {
    return "Тогда повторять тот же совет не будем. Что произошло непосредственно перед видео: появилась мысль «это не поможет», стало неприятно начинать или Вы открыли его почти автоматически?";
  }
  return "Тогда повторять тот же совет не будем. Что произошло непосредственно перед тем, как Вы отказались от шага: появилась мысль, стало неприятно начинать или Вы переключились почти автоматически?";
}
