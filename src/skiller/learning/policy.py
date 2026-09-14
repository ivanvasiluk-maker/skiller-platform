from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class OutcomeReasonCode(str, Enum):
    FIRST_TRY = "first_try"
    REPEAT_HELPFUL = "repeat_helpful"
    RESIZE_AFTER_FAILED = "resize_after_failed"
    REPLACE_LOW_FIT = "replace_low_fit"


@dataclass(frozen=True)
class OutcomePolicyInput:
    """Facts available to the deterministic next-step policy.

    ``completed=None`` represents an abandoned or otherwise incomplete attempt.
    It is deliberately not treated as a successful completion.
    """

    safety_allows_practice: bool
    has_compatible_evidence: bool
    completed: bool | None = None
    helpfulness: int | None = None
    avoidance_increased: bool = False

    def __post_init__(self) -> None:
        if self.helpfulness is not None and not 0 <= self.helpfulness <= 10:
            raise ValueError("helpfulness must be between 0 and 10")


def decide_next_step(facts: OutcomePolicyInput) -> OutcomeReasonCode | None:
    """Return one auditable reason code, or no decision when safety blocks.

    Precedence is intentional: safety wins over history; low fit or increased
    avoidance wins over repetition; incomplete attempts are handled as failed;
    and repetition needs both completion and helpfulness of at least 6.
    """

    if not facts.safety_allows_practice:
        return None
    if not facts.has_compatible_evidence:
        return OutcomeReasonCode.FIRST_TRY
    if facts.avoidance_increased or (
        facts.helpfulness is not None and facts.helpfulness <= 3
    ):
        return OutcomeReasonCode.REPLACE_LOW_FIT
    if facts.completed is not True:
        return OutcomeReasonCode.RESIZE_AFTER_FAILED
    if facts.helpfulness is not None and facts.helpfulness >= 6:
        return OutcomeReasonCode.REPEAT_HELPFUL
    return OutcomeReasonCode.FIRST_TRY
