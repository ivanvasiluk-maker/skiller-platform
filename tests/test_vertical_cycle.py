import unittest

from skiller.application import SkillerCycle
from skiller.domain import Mode, Outcome, SafetyRoute, Situation
from skiller.learning import LearningEngine
from skiller.safety import SafetyPolicy
from skiller.skills.registry import reference_registry


def make_cycle() -> SkillerCycle:
    return SkillerCycle(reference_registry(), LearningEngine(), SafetyPolicy())


class VerticalCycleTests(unittest.TestCase):
    def test_safety_runs_before_skill_selection(self) -> None:
        cycle = make_cycle()
        situation = Situation(
            user_id="u1",
            description="I may lose control",
            desired_outcome="stay safe",
            mode=Mode.HELP_NOW,
            function="task_avoidance",
            intensity=8,
            capacity=4,
            imminent_harm_risk=True,
        )

        result = cycle.start(situation)

        self.assertIs(result.safety.route, SafetyRoute.LIVE_HELP)
        self.assertIsNone(result.attempt)

    def test_complete_cycle_updates_personal_protocol(self) -> None:
        cycle = make_cycle()
        situation = Situation(
            user_id="u2",
            description="I keep postponing the first line of a report",
            desired_outcome="open the report and write one sentence",
            mode=Mode.HELP_NOW,
            function="task_avoidance",
            intensity=6,
            capacity=5,
        )

        started = cycle.start(situation)
        self.assertIsNotNone(started.attempt)
        assert started.attempt is not None
        evidence = cycle.finish(
            started.attempt,
            Outcome(
                completed=True,
                fidelity=8,
                goal_progress=7,
                immediate_effect=6,
                delayed_effect=7,
                execution_cost=3,
                avoidance_increased=False,
                fit=8,
            ),
        )

        self.assertEqual(started.attempt.skill.skill_id, "cbt.micro_start.v1")
        self.assertEqual(evidence.attempts, 1)
        self.assertEqual(evidence.contexts, {"task_avoidance"})
        self.assertGreater(evidence.protocol_score, 0)

    def test_immediate_relief_does_not_outweigh_avoidance(self) -> None:
        cycle = make_cycle()
        situation = Situation(
            user_id="u3",
            description="I want the discomfort to disappear",
            desired_outcome="take one value-aligned action",
            mode=Mode.HELP_NOW,
            function="task_avoidance",
            intensity=5,
            capacity=5,
        )
        attempt = cycle.start(situation).attempt
        self.assertIsNotNone(attempt)
        assert attempt is not None

        helpful = cycle.finish(
            attempt,
            Outcome(True, 8, 8, 6, 8, 3, False, 8),
        )
        helpful_score = helpful.protocol_score

        avoiding = cycle.finish(
            attempt,
            Outcome(True, 8, 0, 10, 0, 2, True, 7),
        )

        self.assertLess(avoiding.protocol_score, helpful_score)

    def test_no_skill_is_safer_than_inventing_one(self) -> None:
        cycle = make_cycle()
        situation = Situation(
            user_id="u4",
            description="Unmapped problem",
            desired_outcome="unknown",
            mode=Mode.HELP_NOW,
            function="unmapped_function",
            intensity=4,
            capacity=5,
        )

        result = cycle.start(situation)

        self.assertIs(result.safety.route, SafetyRoute.CONTINUE)
        self.assertIsNone(result.attempt)
        self.assertEqual(result.no_match_reason, "no_safe_autonomous_skill")


if __name__ == "__main__":
    unittest.main()
