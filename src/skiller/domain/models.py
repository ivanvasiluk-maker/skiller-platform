from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Mode(str, Enum):
    HELP_NOW = "help_now"
    PRACTICE = "practice"


class ClinicalPriority(str, Enum):
    SAFETY = "safety"
    STABILIZATION = "stabilization"
    QUALITY_OF_LIFE = "quality_of_life"
    MAINTENANCE = "maintenance"


class SafetyRoute(str, Enum):
    CONTINUE = "continue"
    LIVE_HELP = "live_help"


@dataclass(frozen=True)
class Situation:
    user_id: str
    description: str
    desired_outcome: str
    mode: Mode
    function: str
    intensity: int
    capacity: int
    imminent_harm_risk: bool = False
    loss_of_control: bool = False
    created_at: datetime = field(default_factory=utc_now)

    def __post_init__(self) -> None:
        if not 0 <= self.intensity <= 10:
            raise ValueError("intensity must be between 0 and 10")
        if not 0 <= self.capacity <= 10:
            raise ValueError("capacity must be between 0 and 10")


@dataclass(frozen=True)
class SafetyDecision:
    route: SafetyRoute
    reason_codes: tuple[str, ...] = ()
    message_key: str = ""


@dataclass(frozen=True)
class Skill:
    skill_id: str
    name: str
    approach: str
    version: int
    target_functions: frozenset[str]
    modes: frozenset[Mode]
    priority: ClinicalPriority
    min_capacity: int
    max_intensity: int
    autonomous: bool
    prerequisites: frozenset[str] = frozenset()
    contraindication_codes: frozenset[str] = frozenset()


@dataclass(frozen=True)
class SkillAttempt:
    user_id: str
    situation: Situation
    skill: Skill
    rationale_codes: tuple[str, ...]
    attempt_id: str = field(default_factory=lambda: str(uuid4()))
    started_at: datetime = field(default_factory=utc_now)


@dataclass(frozen=True)
class Outcome:
    completed: bool
    fidelity: int
    goal_progress: int
    immediate_effect: int
    delayed_effect: int
    execution_cost: int
    avoidance_increased: bool
    fit: int

    def __post_init__(self) -> None:
        for name in (
            "fidelity",
            "goal_progress",
            "immediate_effect",
            "delayed_effect",
            "execution_cost",
            "fit",
        ):
            value = getattr(self, name)
            if not 0 <= value <= 10:
                raise ValueError(f"{name} must be between 0 and 10")


@dataclass
class PersonalSkillEvidence:
    user_id: str
    skill_id: str
    attempts: int = 0
    completions: int = 0
    total_goal_progress: int = 0
    total_immediate_effect: int = 0
    total_delayed_effect: int = 0
    total_execution_cost: int = 0
    total_fit: int = 0
    avoidance_events: int = 0
    contexts: set[str] = field(default_factory=set)

    @property
    def confidence(self) -> float:
        return min(1.0, self.attempts / 5)

    @property
    def protocol_score(self) -> float:
        if self.attempts == 0:
            return 0.0
        n = self.attempts
        completion = self.completions / n
        goal = self.total_goal_progress / (10 * n)
        delayed = self.total_delayed_effect / (10 * n)
        fit = self.total_fit / (10 * n)
        cost = self.total_execution_cost / (10 * n)
        avoidance = self.avoidance_events / n
        return round(
            0.30 * goal
            + 0.20 * delayed
            + 0.20 * completion
            + 0.15 * fit
            - 0.10 * cost
            - 0.25 * avoidance,
            3,
        )

