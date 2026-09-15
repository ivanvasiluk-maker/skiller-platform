export const SKILL_CARD_VERSIONS = {
  "micro-start": "1.0",
  stop: "1.0",
  "dear-man": "1.0",
  "distract-delay": "1.0",
  "check-facts": "1.0",
  "urge-surfing": "1.0",
  "validate-first": "1.0",
  "grounding-543": "1.0",
} as const;

export function skillCardVersion(skillId: string) {
  const version = (SKILL_CARD_VERSIONS as Record<string, string>)[skillId];
  if (!version) throw new Error(`Skill card ${skillId} has no registered version`);
  return version;
}
