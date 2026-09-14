export const OUTCOME_POLICY_VERSION = "outcome-policy-v2";

export const OUTCOME_REASON_CODES = {
  firstTry: "first_try",
  repeatHelpful: "repeat_helpful",
  transferHelpful: "transfer_helpful",
  resizeAfterFailed: "resize_after_failed",
  replaceLowFit: "replace_low_fit",
} as const;

export type OutcomeReasonCode =
  (typeof OUTCOME_REASON_CODES)[keyof typeof OUTCOME_REASON_CODES];

export type OutcomePolicyInput = {
  safetyAllowsPractice: boolean;
  hasCompatibleEvidence: boolean;
  completed?: boolean | null;
  helpfulness?: number | null;
  avoidanceIncreased?: boolean;
  isNewContext?: boolean;
};

export function decideNextStep(
  facts: OutcomePolicyInput,
): OutcomeReasonCode | null {
  if (
    facts.helpfulness !== undefined &&
    facts.helpfulness !== null &&
    (facts.helpfulness < 0 || facts.helpfulness > 10)
  ) {
    throw new RangeError("helpfulness must be between 0 and 10");
  }
  if (!facts.safetyAllowsPractice) return null;
  if (!facts.hasCompatibleEvidence) return OUTCOME_REASON_CODES.firstTry;
  if (
    facts.avoidanceIncreased ||
    (facts.helpfulness !== undefined &&
      facts.helpfulness !== null &&
      facts.helpfulness <= 3)
  ) {
    return OUTCOME_REASON_CODES.replaceLowFit;
  }
  if (facts.completed !== true) return OUTCOME_REASON_CODES.resizeAfterFailed;
  if (
    facts.helpfulness !== undefined &&
    facts.helpfulness !== null &&
    facts.helpfulness >= 6
  ) {
    return facts.isNewContext
      ? OUTCOME_REASON_CODES.transferHelpful
      : OUTCOME_REASON_CODES.repeatHelpful;
  }
  return OUTCOME_REASON_CODES.firstTry;
}
