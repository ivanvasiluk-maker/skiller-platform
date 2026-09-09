from skiller.domain.models import Outcome, PersonalSkillEvidence, SkillAttempt


class LearningEngine:
    def __init__(self) -> None:
        self._evidence: dict[tuple[str, str], PersonalSkillEvidence] = {}

    def record(self, attempt: SkillAttempt, outcome: Outcome) -> PersonalSkillEvidence:
        key = (attempt.user_id, attempt.skill.skill_id)
        evidence = self._evidence.setdefault(
            key,
            PersonalSkillEvidence(
                user_id=attempt.user_id,
                skill_id=attempt.skill.skill_id,
            ),
        )
        evidence.attempts += 1
        evidence.completions += int(outcome.completed)
        evidence.total_goal_progress += outcome.goal_progress
        evidence.total_immediate_effect += outcome.immediate_effect
        evidence.total_delayed_effect += outcome.delayed_effect
        evidence.total_execution_cost += outcome.execution_cost
        evidence.total_fit += outcome.fit
        evidence.avoidance_events += int(outcome.avoidance_increased)
        evidence.contexts.add(attempt.situation.function)
        return evidence

    def personal_protocol(self, user_id: str) -> list[PersonalSkillEvidence]:
        evidence = [row for (uid, _), row in self._evidence.items() if uid == user_id]
        return sorted(evidence, key=lambda row: row.protocol_score, reverse=True)

