import test from "node:test";
import assert from "node:assert/strict";
import { meaningfulVoiceTranscript } from "../lib/voice-transcript.ts";

test("voice transcript rejects silence placeholders, emoji and punctuation", () => {
  for (const value of ["", "   ", "🙂", "...", "эмодзи", "1"]) {
    assert.equal(meaningfulVoiceTranscript(value), null, value);
  }
});

test("voice transcript keeps meaningful Russian text and normalizes spaces", () => {
  assert.equal(
    meaningfulVoiceTranscript("  Нужно   открыть документ и написать заголовок. "),
    "Нужно открыть документ и написать заголовок.",
  );
});

