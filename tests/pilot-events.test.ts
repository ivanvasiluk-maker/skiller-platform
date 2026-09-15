import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildPilotEventPayload,
} from "../lib/pilot-events.ts";
import {
  SKILL_CARD_VERSIONS,
  skillCardVersion,
} from "../lib/skill-card-versions.ts";
import { CHARACTER_VERSION, PRODUCT_VERSION } from "../lib/trainers.ts";

test("every pilot event payload gets the complete version envelope", () => {
  assert.deepEqual(buildPilotEventPayload({ score: 8 }, null), {
    score: 8,
    product_version: PRODUCT_VERSION,
    character_version: CHARACTER_VERSION,
    skill_card_version: null,
  });
  assert.deepEqual(buildPilotEventPayload({ skill_id: "micro-start" }, "1.0"), {
    skill_id: "micro-start",
    product_version: PRODUCT_VERSION,
    character_version: CHARACTER_VERSION,
    skill_card_version: "1.0",
  });
});

test("callers cannot override authoritative versions through domain payload", () => {
  assert.deepEqual(
    buildPilotEventPayload(
      {
        product_version: "stale",
        character_version: "stale",
        skill_card_version: "stale",
      },
      null,
    ),
    {
      product_version: PRODUCT_VERSION,
      character_version: CHARACTER_VERSION,
      skill_card_version: null,
    },
  );
});

test("production code has one pilot event SQL writer", () => {
  const libDir = fileURLToPath(new URL("../lib", import.meta.url));
  const owners = readdirSync(libDir)
    .filter((name) => name.endsWith(".ts"))
    .filter((name) =>
      readFileSync(path.join(libDir, name), "utf8").includes(
        "INSERT OR IGNORE INTO pilot_events",
      ),
    );
  assert.deepEqual(owners, ["pilot-events.ts"]);
});

test("every Frozen skill card has an explicit version", () => {
  assert.equal(Object.keys(SKILL_CARD_VERSIONS).length, 8);
  for (const [skillId, version] of Object.entries(SKILL_CARD_VERSIONS)) {
    assert.match(version, /^\d+\.\d+$/);
    assert.equal(skillCardVersion(skillId), version);
  }
  assert.throws(
    () => skillCardVersion("unregistered-card"),
    /has no registered version/,
  );
});
