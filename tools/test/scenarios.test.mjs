import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, scenarioWords } from '../../js/data/scenarios.js';

test('six built-in scenarios, 80-130 words, 3-4 criteria, ending with a question', () => {
  assert.equal(SCENARIOS.length, 6);
  const ids = new Set();
  for (const s of SCENARIOS) {
    const n = scenarioWords(s);
    assert.ok(n >= 80 && n <= 130, `${s.id} has ${n} words`);
    assert.ok(s.criteria.length >= 3 && s.criteria.length <= 4, s.id);
    assert.ok(s.text.trim().endsWith('?'), `${s.id} must end with a clear question`);
    assert.ok(s.title.length > 3 && s.time >= 60);
    assert.ok(!ids.has(s.id));
    ids.add(s.id);
    assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(s.text + s.title), 'no emoji');
  }
});
