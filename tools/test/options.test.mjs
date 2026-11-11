import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOptions, publicItems, toggleOrder, moveOrder, asArray, pruneOrder } from '../../js/lib/options.js';

const answers = { a: { text: 'Bài A', t0: 3 }, b: { text: 'Bài B', t0: 1 }, c: { text: 'Bài C', ts: 2 } };
const players = { a: { team: 't1', name: 'An' }, b: { team: 't2', name: 'Bình' } };
const review = { a: { st: 'chosen', hl: 'HL A', score: 8, ai: 7.5, edit: 'Bài A đã sửa' }, b: { edit: 'Bài B' } };

test('options follow the order, use edited text, keep the original, drop authors who left', () => {
  const o = buildOptions({ order: ['b', 'a', 'c', 'zz'], review, answers, aid: { a: 'P01' }, players });
  assert.deepEqual(o.map((x) => [x.n, x.uid]), [[0, 'b'], [1, 'a']]);
  assert.equal(o[1].text, 'Bài A đã sửa');
  assert.equal(o[1].orig, 'Bài A');
  assert.equal(o[1].edited, true);
  assert.equal(o[0].edited, false, 'an edit identical to the original is not an edit');
  assert.equal(o[1].id, 'P01');
  assert.equal(o[1].score, 8);
  assert.equal(o[1].ai, 7.5);
  assert.equal(o[1].t0, 3);
});

test('public items carry text and highlight only', () => {
  const items = publicItems(buildOptions({ order: ['a'], review, answers, players }));
  assert.deepEqual(items, [{ text: 'Bài A đã sửa', hl: 'HL A' }]);
});

test('toggle and move keep a clean order; database objects are accepted', () => {
  assert.deepEqual(toggleOrder(['a'], 'b', true), ['a', 'b']);
  assert.deepEqual(toggleOrder(['a', 'b'], 'a', false), ['b']);
  assert.deepEqual(toggleOrder(['a', 'b'], 'a', true), ['b', 'a'], 're-adding moves to the end, never duplicates');
  assert.deepEqual(moveOrder(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b']);
  assert.deepEqual(moveOrder(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepEqual(moveOrder(['a', 'b'], 'zz', 1), ['a', 'b']);
  assert.deepEqual(asArray({ 0: 'x', 2: 'y' }), ['x', 'y']);
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(pruneOrder(['a', 'q'], answers), ['a']);
});
