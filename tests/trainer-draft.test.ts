import test from 'node:test';
import assert from 'node:assert/strict';
import { draftKey, readDraft } from '../lib/trainer-draft.ts';
const now = 1000000000;
const raw = JSON.stringify({ version: 1, context: 'question-1', text: 'Мой неотправленный ответ', mode: 'talk', updatedAt: now });
test('restore only at the same question and within retention period', () => {
  assert.equal(readDraft(raw, 'question-1', now)?.text, 'Мой неотправленный ответ');
  assert.equal(readDraft(raw, 'question-2', now), null);
  assert.equal(readDraft(raw, 'question-1', now + 8 * 86400000), null);
});
test('accounts have separate keys and malformed drafts are rejected', () => {
  assert.notEqual(draftKey('user-a'), draftKey('user-b'));
  assert.equal(readDraft('{broken', 'question-1'), null);
  for (const change of [{ text: 'x'.repeat(1201) }, { mode: 'invalid' }, { updatedAt: now + 1 }, { text: 42 }, { version: 2 }]) {
    assert.equal(readDraft(JSON.stringify({ ...JSON.parse(raw), ...change }), 'question-1', now), null);
  }
});
