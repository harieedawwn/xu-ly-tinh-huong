import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBank, normalizeBank, validateQuestion, addQuestion, updateQuestion, deleteQuestion, duplicateQuestion, moveQuestion, exportBank, importBank, BANK_MAX } from '../../js/lib/bank.js';

const Q = { title: 'Câu mới', text: 'Một tình huống đủ dài để hợp lệ, có câu hỏi ở cuối?', criteria: ['Tiêu chí 1', ' ', 'Tiêu chí 2'], time: 90 };
let seed = 0;
const rnd = () => { seed += 0.137; return seed % 1; };

test('default bank is the 6 built-in scenarios, each valid', () => {
  const b = defaultBank();
  assert.equal(b.length, 6);
  for (const q of b) assert.ok(validateQuestion(q).ok, q.id);
});

test('validateQuestion trims, drops empty criteria and reports every problem', () => {
  const v = validateQuestion(Q);
  assert.ok(v.ok);
  assert.deepEqual(v.value.criteria, ['Tiêu chí 1', 'Tiêu chí 2']);
  assert.deepEqual(validateQuestion({ title: '', text: 'ngắn', criteria: [], time: 5 }).errors, ['title', 'textShort', 'time']);
  assert.ok(validateQuestion({ ...Q, criteria: Array(9).fill('x') }).errors.includes('criteriaMany'));
  assert.ok(validateQuestion({ ...Q, title: 'x'.repeat(81) }).errors.includes('titleLong'));
  assert.ok(validateQuestion({ ...Q, criteria: 'a\nb' }).ok, 'criteria may be a textarea string');
});

test('add / edit / delete / duplicate / reorder', () => {
  let b = defaultBank();
  const added = addQuestion(b, Q, rnd);
  assert.ok(added.ok);
  b = added.bank;
  assert.equal(b.length, 7);
  assert.equal(b[6].id, added.id);
  assert.ok(!defaultBank().some((q) => q.id === added.id));

  const upd = updateQuestion(b, added.id, { title: 'Đổi tên', time: 150 });
  assert.equal(upd.bank[6].title, 'Đổi tên');
  assert.equal(upd.bank[6].time, 150);
  assert.equal(updateQuestion(b, added.id, { text: 'x' }).ok, false);
  assert.equal(updateQuestion(b, 'nope', {}).ok, false);
  assert.equal(b[6].title, 'Câu mới', 'immutable');

  const dup = duplicateQuestion(b, 'b2', rnd);
  assert.equal(dup.bank.length, 8);
  assert.equal(dup.bank[2].title, 'Chuyển sang thành phố mới (bản sao)');
  assert.notEqual(dup.bank[2].id, 'b2');
  assert.equal(dup.bank[2].text, dup.bank[1].text);

  assert.deepEqual(moveQuestion(b, 'b1', 1).bank.slice(0, 2).map((q) => q.id), ['b2', 'b1']);
  assert.deepEqual(moveQuestion(b, 'b1', -1).bank, b, 'clamped at the top');
  assert.equal(moveQuestion(b, added.id, -6).bank[0].id, added.id);

  const del = deleteQuestion(b, 'b3');
  assert.equal(del.bank.length, 6);
  assert.equal(deleteQuestion(b, 'zz').ok, false);
});

test('bank size is capped', () => {
  let b = defaultBank();
  while (b.length < BANK_MAX) b = addQuestion(b, Q, rnd).bank;
  assert.equal(addQuestion(b, Q, rnd).errors[0], 'full');
  assert.equal(duplicateQuestion(b, 'b1', rnd).errors[0], 'full');
});

test('export then import round-trips; merge keeps current ones and re-ids collisions; replace swaps', () => {
  const b = defaultBank();
  const json = exportBank(b);
  const rep = importBank(json, [], { mode: 'replace' });
  assert.deepEqual(rep.bank, b);
  const merged = importBank(json, b, { mode: 'merge', rnd });
  assert.equal(merged.bank.length, 12);
  assert.equal(new Set(merged.bank.map((q) => q.id)).size, 12, 'ids stay unique');
  assert.equal(merged.added, 6);
});

test('import rejects junk and skips invalid entries', () => {
  assert.equal(importBank('not json', []).error, 'json');
  assert.equal(importBank('{"a":1}', []).error, 'shape');
  assert.equal(importBank('[]', []).error, 'empty');
  const mixed = importBank(JSON.stringify([Q, { title: 'x' }, 5, null]), []);
  assert.equal(mixed.added, 1);
  assert.equal(mixed.skipped, 3);
  assert.ok(importBank('﻿' + JSON.stringify({ questions: [Q] }), []).ok, 'BOM tolerated');
  const hostile = importBank(JSON.stringify([{ ...Q, id: '__proto__' }, { ...Q, id: 'a b' }]), []);
  assert.ok(hostile.bank.every((q) => /^[A-Za-z0-9_-]+$/.test(q.id)));
});

test('normalizeBank repairs what the database returns (objects, missing criteria)', () => {
  const fromDb = { 0: { id: 'a', title: 'A', text: 'x'.repeat(30), time: 60 }, 1: { id: 'b', title: 'B', text: 'y'.repeat(30), criteria: { 0: 'c1' }, time: 90 }, 3: null };
  const n = normalizeBank(fromDb);
  assert.equal(n.length, 2);
  assert.deepEqual(n[0].criteria, []);
  assert.deepEqual(n[1].criteria, ['c1']);
  assert.deepEqual(normalizeBank(null), []);
});
