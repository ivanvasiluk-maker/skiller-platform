from skiller.domain.models import SafetyDecision, SafetyRoute, Situation


class SafetyPolicy:
    """Deterministic gate that runs before formulation or recommendation."""

    def evaluate(self, situation: Situation) -> SafetyDecision:
        reasons: list[str] = []
        if situation.imminent_harm_risk:
            reasons.append("imminent_harm_risk")
        if situation.loss_of_control:
            reasons.append("loss_of_control")
        if reasons:
            return SafetyDecision(
                route=SafetyRoute.LIVE_HELP,
                reason_codes=tuple(reasons),
                message_key="safety.live_help_required",
            )
        return SafetyDecision(route=SafetyRoute.CONTINUE)

