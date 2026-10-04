import test from "node:test";
import assert from "node:assert/strict";
import { concreteActionFromText } from "../lib/conversation-language.ts";

test("keeps a concrete action from the user's own words", () => {
  assert.equal(
    concreteActionFromText("Нужно открыть документ и написать первый заголовок."),
    "Открыть документ и написать первый заголовок",
  );
  assert.equal(
    concreteActionFromText("Мне надо сделать отчёт, но я откладываю"),
    "Сделать отчёт",
  );
});

test("does not invent an action from an emotional description", () => {
  assert.equal(concreteActionFromText("Мне тревожно и трудно собраться"), null);
});


test("missing-link questions follow saved address independently of the user's words", async () => {
  const { missingLinkQuestion } = await import("../lib/conversation-language.ts");
  assert.match(missingLinkQuestion("открыл видео"), /Вы открыли/);
  assert.doesNotMatch(missingLinkQuestion("Вы сказали смотреть видео", { address_form: "informal" }), /Вы открыли/);
  assert.match(missingLinkQuestion("я отказалась", { address_form: "informal" }), /перед отказом/);
});
