import test from "node:test";
import assert from "node:assert/strict";
import { classifyAttemptReport, conversationIntent, extractShortTrigger, missingLinkQuestion } from "../lib/conversation-language.ts";

const procrastinationCase = `Мне 34 года. Уже третий день откладываю важную рабочую задачу. Я понимаю, что она займёт максимум пару часов, но каждый раз открываю файл и переключаюсь на Telegram или YouTube. Завтра дедлайн. Что мне сейчас делать?`;

test("explicit request for immediate help bypasses mandatory hypothesis confirmation", () => {
  assert.equal(conversationIntent(procrastinationCase), "direct_action_request");
  assert.equal(conversationIntent("Хочу подробно понять, почему я каждый раз замираю"), "explore");
});

test("hypothesis trigger never repeats the full user message", () => {
  const trigger = extractShortTrigger(procrastinationCase);
  assert.ok(trigger.split(/\s+/).length >= 3);
  assert.ok(trigger.split(/\s+/).length <= 12);
  assert.ok(!trigger.includes("Telegram"));
  assert.ok(!trigger.includes("Что мне сейчас делать"));
});

test("acknowledgement is not evidence of an attempt", () => {
  for (const answer of ["Да", "Понятно", "Хорошо", "Похоже"]) {
    assert.equal(classifyAttemptReport(answer), "unknown");
  }
  assert.equal(classifyAttemptReport("Сделал"), "done");
  assert.equal(classifyAttemptReport("Открыл файл, но остановился"), "partial");
});

test("not done starts a missing-link question instead of repeating advice", () => {
  const answer = "Не сделал. Подумал, что это ерунда, и опять полез смотреть видео.";
  assert.equal(classifyAttemptReport(answer), "not_done");
  const reply = missingLinkQuestion(answer);
  assert.match(reply, /повторять тот же совет не будем/u);
  assert.match(reply, /не поможет/u);
  assert.doesNotMatch(reply, /попробуйте ещё раз|просто начать/u);
});
