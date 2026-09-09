from __future__ import annotations

from dataclasses import dataclass

from skiller.domain.models import (
    Outcome,
    PersonalSkillEvidence,
    SafetyDecision,
    SafetyRoute,
    Situation,
    SkillAttempt,
)
from skiller.learning.engine import LearningEngine
from skiller.safety.policy import SafetyPolicy
from skiller.skills.registry import SkillRegistry


@dataclass(frozen=True)
class CycleStart:
    safety: SafetyDecision
    attempt: SkillAttempt | None
    no_match_reason: str | None = None


class SkillerCycle:
    """One auditable pass through safety, selection, action, and learning."""

    def __init__(
        self,
        registry: SkillRegistry,
        learning: LearningEngine,
        safety: SafetyPolicy,
    ) -> None:
        self.registry = registry
        self.learning = learning
        self.safety = safety

    def start(
        self,
        situation: Situation,
        mastered_prerequisites: frozenset[str] = frozenset(),
        exclusion_codes: frozenset[str] = frozenset(),
    ) -> CycleStart:
        safety_decision = self.safety.evaluate(situation)
        if safety_decision.route is not SafetyRoute.CONTINUE:
            return CycleStart(safety=safety_decision, attempt=None)

        eligible = self.registry.eligible(
            situation,
            mastered_prerequisites=mastered_prerequisites,
            exclusion_codes=exclusion_codes,
        )
        if not eligible:
            return CycleStart(
                safety=safety_decision,
                attempt=None,
                no_match_reason="no_safe_autonomous_skill",
            )

        prior = {
            row.skill_id: row
            for row in self.learning.personal_protocol(situation.user_id)
        }
        eligible.sort(
            key=lambda skill: (
                prior.get(skill.skill_id).protocol_score if skill.skill_id in prior else 0,
                -skill.min_capacity,
            ),
            reverse=True,
        )
        selected = eligible[0]
        attempt = SkillAttempt(
            user_id=situation.user_id,
            situation=situation,
            skill=selected,
            rationale_codes=(
                f"function:{situation.function}",
                f"mode:{situation.mode.value}",
                f"priority:{selected.priority.value}",
            ),
        )
        return CycleStart(safety=safety_decision, attempt=attempt)

    def finish(self, attempt: SkillAttempt, outcome: Outcome) -> PersonalSkillEvidence:
        return self.learning.record(attempt, outcome)

