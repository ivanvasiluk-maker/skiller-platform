import unittest

from skiller.learning import (
    OutcomePolicyInput,
    OutcomeReasonCode,
    decide_next_step,
)


def facts(**overrides: object) -> OutcomePolicyInput:
    values: dict[str, object] = {
        "safety_allows_practice": True,
        "has_compatible_evidence": True,
        "completed": True,
        "helpfulness": 7,
        "avoidance_increased": False,
    }
    values.update(overrides)
    return OutcomePolicyInput(**values)  # type: ignore[arg-type]


class OutcomePolicyTests(unittest.TestCase):
    def test_safety_blocks_every_outcome_aware_decision(self) -> None:
        decision = decide_next_step(
            facts(
                safety_allows_practice=False,
                completed=True,
                helpfulness=10,
            )
        )

        self.assertIsNone(decision)

    def test_first_try_when_no_compatible_evidence_exists(self) -> None:
        decision = decide_next_step(
            facts(
                has_compatible_evidence=False,
                completed=None,
                helpfulness=None,
            )
        )

        self.assertIs(decision, OutcomeReasonCode.FIRST_TRY)

    def test_helpful_completion_is_repeated_at_threshold(self) -> None:
        decision = decide_next_step(facts(completed=True, helpfulness=6))

        self.assertIs(decision, OutcomeReasonCode.REPEAT_HELPFUL)

    def test_failed_attempt_is_resized(self) -> None:
        decision = decide_next_step(facts(completed=False, helpfulness=5))

        self.assertIs(decision, OutcomeReasonCode.RESIZE_AFTER_FAILED)

    def test_abandoned_attempt_is_not_a_completion(self) -> None:
        decision = decide_next_step(facts(completed=None, helpfulness=None))

        self.assertIs(decision, OutcomeReasonCode.RESIZE_AFTER_FAILED)

    def test_low_helpfulness_replaces_even_after_completion(self) -> None:
        decision = decide_next_step(facts(completed=True, helpfulness=3))

        self.assertIs(decision, OutcomeReasonCode.REPLACE_LOW_FIT)

    def test_increased_avoidance_prevents_automatic_repeat(self) -> None:
        decision = decide_next_step(
            facts(completed=True, helpfulness=9, avoidance_increased=True)
        )

        self.assertIs(decision, OutcomeReasonCode.REPLACE_LOW_FIT)

    def test_uncertain_midrange_result_does_not_repeat_automatically(self) -> None:
        decision = decide_next_step(facts(completed=True, helpfulness=5))

        self.assertIs(decision, OutcomeReasonCode.FIRST_TRY)

    def test_decision_is_deterministic(self) -> None:
        policy_input = facts(completed=True, helpfulness=8)

        decisions = {decide_next_step(policy_input) for _ in range(20)}

        self.assertEqual(decisions, {OutcomeReasonCode.REPEAT_HELPFUL})

    def test_helpfulness_range_is_validated(self) -> None:
        with self.assertRaisesRegex(ValueError, "between 0 and 10"):
            facts(helpfulness=11)


if __name__ == "__main__":
    unittest.main()
