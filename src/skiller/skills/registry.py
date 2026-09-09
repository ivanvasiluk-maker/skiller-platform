from __future__ import annotations

from collections.abc import Iterable

from skiller.domain.models import ClinicalPriority, Mode, Situation, Skill


class SkillRegistry:
    def __init__(self, skills: Iterable[Skill] = ()) -> None:
        self._skills = {skill.skill_id: skill for skill in skills}

    def register(self, skill: Skill) -> None:
        current = self._skills.get(skill.skill_id)
        if current and current.version >= skill.version:
            raise ValueError("skill version must increase")
        self._skills[skill.skill_id] = skill

    def get(self, skill_id: str) -> Skill:
        return self._skills[skill_id]

    def eligible(
        self,
        situation: Situation,
        mastered_prerequisites: frozenset[str] = frozenset(),
        exclusion_codes: frozenset[str] = frozenset(),
    ) -> list[Skill]:
        return [
            skill
            for skill in self._skills.values()
            if situation.mode in skill.modes
            and situation.function in skill.target_functions
            and situation.capacity >= skill.min_capacity
            and situation.intensity <= skill.max_intensity
            and skill.prerequisites <= mastered_prerequisites
            and not (skill.contraindication_codes & exclusion_codes)
            and skill.autonomous
        ]


def reference_registry() -> SkillRegistry:
    """Small seed set proving the registry contract, not the final library."""

    return SkillRegistry(
        [
            Skill(
                skill_id="dbt.stop.v1",
                name="STOP",
                approach="DBT",
                version=1,
                target_functions=frozenset({"impulsive_action", "conflict_escalation"}),
                modes=frozenset({Mode.HELP_NOW, Mode.PRACTICE}),
                priority=ClinicalPriority.STABILIZATION,
                min_capacity=2,
                max_intensity=9,
                autonomous=True,
            ),
            Skill(
                skill_id="cbt.micro_start.v1",
                name="Minimum complete start",
                approach="CBT",
                version=1,
                target_functions=frozenset({"task_avoidance", "overwhelm"}),
                modes=frozenset({Mode.HELP_NOW, Mode.PRACTICE}),
                priority=ClinicalPriority.QUALITY_OF_LIFE,
                min_capacity=1,
                max_intensity=8,
                autonomous=True,
            ),
            Skill(
                skill_id="dbt.dear_man_rehearsal.v1",
                name="DEAR MAN rehearsal",
                approach="DBT",
                version=1,
                target_functions=frozenset({"boundary_difficulty", "request_avoidance"}),
                modes=frozenset({Mode.PRACTICE}),
                priority=ClinicalPriority.QUALITY_OF_LIFE,
                min_capacity=4,
                max_intensity=7,
                autonomous=True,
            ),
        ]
    )

