import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAiResult, lenientParse, scriptPages, normId } from '../../js/lib/ai.js';

const fx = (n) => readFileSync(new URL(`../fixtures/parse/${n}.txt`, import.meta.url), 'utf8');
const VALID = Array.from({ length: 12 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
const ctx = { validIds: VALID, maxScore: 10, step: 0.5 };
const ids = (a) => a.map((x) => x.id);
const codes = (r) => r.warnings.map((w) => w.code);

test('clean JSON', () => {
  const r = parseAiResult(fx('clean'), ctx);
  assert.equal(r.status, 'json');
  assert.deepEqual(ids(r.selected), ['P03', 'P07']);
  assert.equal(r.selected[0].suggestedScore, 8.5);
  assert.match(r.selected[0].highlight, /bảng so sánh/);
  assert.deepEqual(ids(r.rejected), ['P02']);
  assert.equal(r.script.perOption.length, 2);
  assert.equal(r.script.closing, 'Cảm ơn các bạn.');
  assert.equal(r.warnings.length, 0);
});

test('fenced JSON with prose before and after (and stray braces in prose)', () => {
  const r = parseAiResult(fx('fenced-prose'), ctx);
  assert.equal(r.status, 'json');
  assert.deepEqual(ids(r.selected), ['P05', 'P09']);
  assert.equal(r.script.opening, 'Mở đầu.');
});

test('smart quotes as JSON delimiters', () => {
  const r = parseAiResult(fx('smart-quotes'), ctx);
  assert.equal(r.status, 'json');
  assert.deepEqual(ids(r.selected), ['P01', 'P04']);
  assert.equal(r.selected[0].highlight, 'Gặp cô chủ nhiệm trước.');
  assert.equal(r.script.perOption[0].id, 'P01');
});

test('trailing commas', () => {
  const r = parseAiResult(fx('trailing-commas'), ctx);
  assert.deepEqual(ids(r.selected), ['P02', 'P06']);
  assert.deepEqual(ids(r.rejected), ['P01']);
  assert.equal(r.script.closing, 'Đóng.');
});

test('Vietnamese text containing unescaped quotes', () => {
  const r = parseAiResult(fx('vietnamese-quotes'), ctx);
  assert.equal(r.status, 'json');
  assert.deepEqual(ids(r.selected), ['P04', 'P08']);
  assert.equal(r.selected[0].highlight, 'Em sẽ nói "thật lòng" với bố mẹ và hỏi "con cần làm gì để hai bên yên tâm?"');
  assert.equal(r.selected[0].reason, 'Bài viết "rất chân thành", biết lắng nghe.');
  assert.equal(r.rejected[0].reason, 'Chỉ lặp lại câu "hãy cố gắng" mà không có hành động.');
  assert.equal(r.script.opening, 'Các bạn nghe thử câu này: "ai cũng muốn tốt cho con".');
  assert.match(r.script.perOption[0].speech, /"thật lòng"/);
});

test('unknown ids are ignored with a warning; duplicates keep the first; loose ids are normalised; conflicts become rejected', () => {
  const r = parseAiResult(fx('unknown-duplicate'), ctx);
  assert.deepEqual(ids(r.selected), ['P02', 'P05']);
  assert.equal(r.selected[0].suggestedScore, 8);
  assert.deepEqual(ids(r.rejected), ['P04']);
  const c = codes(r);
  for (const k of ['unknown-id', 'duplicate-id', 'conflict']) assert.ok(c.includes(k), k);
  assert.ok(r.warnings.some((w) => w.code === 'unknown-id' && w.id === 'P99'));
  assert.ok(r.warnings.some((w) => w.code === 'unknown-id' && w.id === 'P77'));
});

test('missing fields are accepted', () => {
  const r = parseAiResult(fx('missing-fields'), ctx);
  assert.equal(r.status, 'json');
  assert.deepEqual(ids(r.selected), ['P01', 'P03', 'P05', 'P06']);
  assert.equal(r.selected[0].highlight, '');
  assert.equal(r.selected[0].suggestedScore, null);
  assert.equal(r.selected[2].suggestedScore, 8.5); // "8,5" with a decimal comma
  assert.equal(r.selected[3].suggestedScore, 10); // 42 clamped to the max score
  assert.ok(codes(r).includes('score-range'));
  assert.equal(r.script, null);
  assert.ok(codes(r).includes('no-script'));
});

test('free text that only mentions P-ids: ids found in order, unknown ones warned, status free', () => {
  const r = parseAiResult(fx('free-ids'), ctx);
  assert.equal(r.status, 'free');
  assert.deepEqual(r.foundIds, ['P03', 'P07', 'P09', 'P02', 'P12']);
  assert.ok(r.warnings.some((w) => w.code === 'unknown-id' && w.id === 'P55'));
  assert.equal(r.selected.length, 0);
  assert.equal(r.raw, fx('free-ids'));
});

test('prose with no ids: free, with a hint to select manually', () => {
  const r = parseAiResult(fx('prose-only'), ctx);
  assert.equal(r.status, 'free');
  assert.deepEqual(r.foundIds, []);
  assert.ok(codes(r).includes('no-ids'));
});

test('empty and whitespace-only input', () => {
  for (const s of ['', '   \n\n  ', null, undefined, fx('empty')]) {
    const r = parseAiResult(s, ctx);
    assert.equal(r.status, 'empty');
    assert.equal(r.selected.length, 0);
  }
});

test('answers the app flagged as instructing the judge are never auto-selected', () => {
  const r = parseAiResult(fx('injection-selected'), { ...ctx, blockedIds: ['P10'] });
  assert.deepEqual(ids(r.selected), ['P03']);
  assert.deepEqual(r.blocked, ['P10']);
  assert.ok(codes(r).includes('injection-selected'));
});

test('selected given as plain id strings, keys in other cases, selected too many', () => {
  const r = parseAiResult('{"Selected":["P01","P02","P03"],"REJECTED":["P04"]}', { ...ctx, n: 2 });
  assert.deepEqual(ids(r.selected), ['P01', 'P02', 'P03']);
  assert.deepEqual(ids(r.rejected), ['P04']);
  assert.ok(codes(r).includes('too-many'));
});

test('lenientParse basics', () => {
  assert.deepEqual(lenientParse('{"a":[1,2,],"b":{"c":null,},}'), { a: [1, 2], b: { c: null } });
  assert.deepEqual(lenientParse("{a: 'x', b: true}"), { a: 'x', b: true });
  assert.deepEqual(lenientParse('{"a":"một\\nhai","u":"\\u00e9"}'), { a: 'một\nhai', u: 'é' });
  assert.deepEqual(lenientParse('{"a":"x" "b":"y"}'), { a: 'x', b: 'y' }); // missing comma
  assert.throws(() => lenientParse('{"a": }'));
  assert.throws(() => lenientParse('{"a": "unterminated'));
});

test('normId', () => {
  assert.equal(normId('p7'), 'P07');
  assert.equal(normId(' P 007 '), 'P07');
  assert.equal(normId('Q1'), null);
  assert.equal(normId(5), null);
});

test('scriptPages: one option per page in showcase numbering; free text paged by paragraphs', () => {
  const r = parseAiResult(fx('clean'), ctx);
  const pages = scriptPages(r, (id) => ({ P07: 1, P03: 2 })[id] ?? null);
  assert.deepEqual(pages.map((p) => p.title), ['Mở đầu', 'Phương án 2', 'Phương án 1', 'Kết luận']);
  const unshown = scriptPages(r, () => null);
  assert.match(unshown[1].title, /chưa chiếu/);
  const free = scriptPages(parseAiResult('Đoạn một.\n\nĐoạn hai.', ctx));
  assert.equal(free.length, 1);
  assert.equal(scriptPages(null).length, 0);
  assert.equal(scriptPages(parseAiResult('{"selected":[]}', ctx)).length, 0);
});

test('performance: 20 KB of prose before the JSON still parses fast', () => {
  const prose = 'Lời dẫn dài. '.repeat(1500);
  const t0 = Date.now();
  const r = parseAiResult(prose + fx('clean') + prose, ctx);
  assert.equal(r.selected.length, 2);
  assert.ok(Date.now() - t0 < 500);
});
