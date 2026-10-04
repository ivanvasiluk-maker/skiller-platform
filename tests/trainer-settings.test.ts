import assert from "node:assert/strict";
import test from "node:test";
import { buildTrainerSettingsChange } from "../lib/trainer-settings.ts";

const profile = {
  user_id: "user-1",
  pseudonym: "pilot-1",
  trainer_id: "marsha" as const,
  interaction_mode: "support" as const,
};

test("trainer and interaction mode change produce auditable final-state events", () => {
  assert.deepEqual(
    buildTrainerSettingsChange(profile, {
      trainerId: "beck",
      interactionMode: "direct",
    }),
    {
      trainerId: "beck",
      interactionMode: "direct",
      events: [
        {
          name: "trainer_changed",
          trainerId: "beck",
          payload: {
            from_trainer_id: "marsha",
            to_trainer_id: "beck",
            final_interaction_mode: "direct",
          },
        },
        {
          name: "interaction_mode_changed",
          trainerId: "beck",
          payload: {
            from_interaction_mode: "support",
            to_interaction_mode: "direct",
            final_trainer_id: "beck",
          },
        },
      ],
    },
  );
});

test("unchanged settings are a no-op", () => {
  assert.deepEqual(buildTrainerSettingsChange(profile, {}), {
    trainerId: "marsha",
    interactionMode: "support",
    events: [],
  });
});

test("changing one setting does not invent the other change", () => {
  const result = buildTrainerSettingsChange(profile, {
    interactionMode: "explore",
  });
  assert.equal(result.trainerId, "marsha");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0]?.name, "interaction_mode_changed");
  assert.deepEqual(result.events[0]?.payload, {
    from_interaction_mode: "support",
    to_interaction_mode: "explore",
    final_trainer_id: "marsha",
  });
});


test("system prompts use explicit address variants and retain emergency contact", async () => {
  const { systemPrompt } = await import("../lib/communication-preferences.ts");
  assert.match(systemPrompt({}, "reviseHypothesis"), /Вашим/);
  assert.match(systemPrompt({ address_form: "informal" }, "reviseHypothesis"), /твоим/);
  assert.match(systemPrompt({ address_form: "informal" }, "rejectPractice"), /тебя/);
  for (const address_form of ["formal", "informal"] as const) {
    for (const grammatical_gender of ["neutral", "masculine", "feminine"] as const) {
      assert.match(systemPrompt({ address_form, grammatical_gender }, "worsened"), /112/);
      assert.equal(systemPrompt({ address_form, grammatical_gender }, "partial"), systemPrompt({ address_form }, "partial"));
    }
  }
});


test("hypothesis fragments keep address independent from gender", async () => {
  const { systemPrompt } = await import("../lib/communication-preferences.ts");
  for (const grammatical_gender of ["neutral", "masculine", "feminine"] as const) {
    assert.equal(systemPrompt({ address_form: "informal", grammatical_gender }, "hypothesisConfirmation"), "Это похоже на твой опыт?");
    assert.equal(systemPrompt({ address_form: "formal", grammatical_gender }, "correctionLabel"), "Ваше уточнение:");
  }
});
