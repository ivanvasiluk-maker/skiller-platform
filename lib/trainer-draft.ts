export type TrainerDraft = { version: 1; context: string; text: string; mode: "practice" | "stuck" | "distress" | "talk"; updatedAt: number };
const maxAge = 7 * 24 * 60 * 60 * 1000;
export function draftKey(userId: string) { return `skiller-draft-v1:${encodeURIComponent(userId)}`; }
export function readDraft(raw: string | null, context: string, now = Date.now()): TrainerDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as TrainerDraft;
    if (value.version !== 1 || value.context !== context || typeof value.text !== "string" || !value.text.trim() || value.text.length > 1200 || !["practice", "stuck", "distress", "talk"].includes(value.mode) || !Number.isFinite(value.updatedAt) || value.updatedAt > now || now - value.updatedAt > maxAge) return null;
    return value;
  } catch { return null; }
}
