import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decideNextStep } from "../lib/outcome-policy.ts";

type Fixture = {
  name: string;
  facts: {
    safety_allows_practice: boolean;
    has_compatible_evidence: boolean;
    completed: boolean | null;
    helpfulness: number | null;
    avoidance_increased: boolean;
  };
  expected: string | null;
};

const fixturePath = fileURLToPath(
  new URL("./fixtures/outcome-policy.json", import.meta.url),
);
const fixtures = JSON.parse(readFileSync(fixturePath, "utf8")) as Fixture[];

for (const fixture of fixtures) {
  test(`shared policy: ${fixture.name}`, () => {
    const result = decideNextStep({
      safetyAllowsPractice: fixture.facts.safety_allows_practice,
      hasCompatibleEvidence: fixture.facts.has_compatible_evidence,
      completed: fixture.facts.completed,
      helpfulness: fixture.facts.helpfulness,
      avoidanceIncreased: fixture.facts.avoidance_increased,
    });

    assert.equal(result, fixture.expected);
  });
}

test("TypeScript policy validates helpfulness", () => {
  assert.throws(
    () =>
      decideNextStep({
        safetyAllowsPractice: true,
        hasCompatibleEvidence: true,
        completed: true,
        helpfulness: 11,
      }),
    /between 0 and 10/,
  );
});
