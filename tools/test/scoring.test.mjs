import test from 'node:test';
import assert from 'node:assert/strict';
import { snapScore, rankOptions, buildAward, buildReveal, totals, rankBoard, latestAwardKey, undoLastAward, countVotes, finalValue, votePoints, round2, PLACE_POINTS } from '../../js/lib/scoring.js';

const opt = (n, team, score, votes, t0, extra = {}) => ({ key: `u${n}`, n, team, score, votes, t0, name: `Tên ${n}`, text: `Bài ${n}`, ...extra });
const S = (o = {}) => ({ maxScore: 10, formula: 'host', voteWeight: 50, awardTop: 1, teamAward: 'sum', ...o });
const order = (r) => r.map((x) => x.n);

test('snapScore clamps, snaps to the step, accepts decimal commas, rejects junk', () => {
  assert.equal(snapScore(8.3, 0.5, 10), 8.5);
  assert.equal(snapScore(8.2, 0.5, 10), 8);
  assert.equal(snapScore('7,5', 0.5, 10), 7.5);
  assert.equal(snapScore(8.5, 1, 10), 9);
  assert.equal(snapScore(42, 0.5, 10), 10);
  assert.equal(snapScore(-3, 0.5, 10), 0);
  for (const bad of ['', null, undefined, 'abc', NaN, Infinity]) assert.equal(snapScore(bad), null);
});

test('formula "host": ranks by host score only', () => {
  const r = rankOptions([opt(0, 't1', 7, 9, 1), opt(1, 't2', 9, 0, 2), opt(2, 't3', 8, 5, 3)], S());
  assert.deepEqual(order(r), [1, 2, 0]);
  assert.deepEqual(r.map((x) => x.value), [9, 8, 7]);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 3]);
});

test('formula "votes": vote points = max score x votes / top votes; host score ignored except as tie-break', () => {
  const r = rankOptions([opt(0, 't1', 10, 2, 1), opt(1, 't2', 1, 8, 2), opt(2, 't3', 5, 4, 3)], S({ formula: 'votes' }));
  assert.deepEqual(order(r), [1, 2, 0]);
  assert.deepEqual(r.map((x) => x.value), [10, 5, 2.5]);
  assert.equal(votePoints(0, 0, 10), 0, 'no votes cast: zero, no division by zero');
  assert.deepEqual(rankOptions([opt(0, 't1', 3, 0, 1), opt(1, 't2', 4, 0, 2)], S({ formula: 'votes' })).map((x) => x.value), [0, 0]);
});

test('formula "mix": weighted blend of host score and vote points', () => {
  const o = [opt(0, 't1', 10, 0, 1), opt(1, 't2', 6, 10, 2)];
  const r50 = rankOptions(o, S({ formula: 'mix', voteWeight: 50 }));
  assert.deepEqual(r50.map((x) => [x.n, x.value]), [[1, 8], [0, 5]]);
  const r20 = rankOptions(o, S({ formula: 'mix', voteWeight: 20 }));
  assert.deepEqual(r20.map((x) => [x.n, x.value]), [[0, 8], [1, 6.8]]);
  assert.equal(finalValue({ hostScore: 7, votePts: 3 }, { formula: 'mix', voteWeight: 0 }), 7);
  assert.equal(finalValue({ hostScore: 7, votePts: 3 }, { formula: 'mix', voteWeight: 100 }), 3);
  assert.equal(finalValue({ hostScore: 7, votePts: 3 }, { formula: 'mix', voteWeight: 250 }), 3, 'weight is clamped');
});

test('tie-break: same final -> host score, then votes, then earlier submission, then option order', () => {
  // formula votes: equal vote points, host score decides
  let r = rankOptions([opt(0, 't1', 5, 4, 1), opt(1, 't2', 8, 4, 2)], S({ formula: 'votes' }));
  assert.deepEqual(order(r), [1, 0]);
  // formula host: equal host score, votes decide
  r = rankOptions([opt(0, 't1', 8, 1, 1), opt(1, 't2', 8, 6, 2), opt(2, 't3', 8, 3, 3)], S());
  assert.deepEqual(order(r), [1, 2, 0]);
  // all equal: earlier submission wins
  r = rankOptions([opt(0, 't1', 8, 3, 300), opt(1, 't2', 8, 3, 100), opt(2, 't3', 8, 3, 200)], S());
  assert.deepEqual(order(r), [1, 2, 0]);
  // submission time also missing: option order
  r = rankOptions([opt(0, 't1', 8, 3, undefined), opt(1, 't2', 8, 3, undefined)], S());
  assert.deepEqual(order(r), [0, 1]);
  // mix: equal blend reached by different routes -> host score first
  r = rankOptions([opt(0, 't1', 10, 0, 5), opt(1, 't2', 0, 10, 1)], S({ formula: 'mix', voteWeight: 50 }));
  assert.deepEqual(r.map((x) => x.value), [5, 5]);
  assert.deepEqual(order(r), [0, 1]);
});

test('missing host score counts as 0; float noise does not break ties', () => {
  const r = rankOptions([opt(0, 't1', null, 0, 1), opt(1, 't2', 0.1 + 0.2, 0, 2), opt(2, 't3', 0.3, 0, 3)], S({ maxScore: 5 }));
  assert.equal(r[0].n, 1);
  assert.equal(round2(r[0].value), 0.3);
  assert.equal(r[1].value, 0.3);
});

test('award "sum": every showcased option earns its final value; tổ total = sum of its options; honour top 1', () => {
  const ranked = rankOptions([opt(0, 't1', 9, 0, 1), opt(1, 't1', 7.5, 0, 2), opt(2, 't2', 8, 0, 3)], S());
  const a = buildAward({ ranked, settings: S({ awardTop: 1, teamAward: 'sum' }), roundId: 'r1', at: 10, question: 'Q' });
  assert.deepEqual(a.teams, { t1: 16.5, t2: 8 });
  assert.deepEqual(a.players, { u0: 9, u1: 7.5, u2: 8 });
  assert.deepEqual(a.items.map((i) => i.honoured), [true, false, false]);
  assert.equal(a.top, 1);
});

test('award "place" with top 3: 3/2/1 to the honoured only; top 1: only first place', () => {
  const ranked = rankOptions([opt(0, 't1', 5, 0, 1), opt(1, 't2', 9, 0, 2), opt(2, 't1', 7, 0, 3), opt(3, 't3', 6, 0, 4)], S());
  const a3 = buildAward({ ranked, settings: S({ awardTop: 3, teamAward: 'place' }), roundId: 'r1' });
  assert.deepEqual(PLACE_POINTS, [3, 2, 1]);
  assert.deepEqual(a3.items.map((i) => [i.n, i.points]), [[1, 3], [2, 2], [3, 1], [0, 0]]);
  assert.deepEqual(a3.teams, { t2: 3, t1: 2, t3: 1 });
  assert.deepEqual(a3.players, { u1: 3, u2: 2, u3: 1 });
  const a1 = buildAward({ ranked, settings: S({ awardTop: 1, teamAward: 'place' }), roundId: 'r1' });
  assert.deepEqual(a1.teams, { t2: 3 });
  const few = buildAward({ ranked: ranked.slice(0, 2), settings: S({ awardTop: 3, teamAward: 'place' }), roundId: 'r1' });
  assert.deepEqual(few.teams, { t2: 3, t1: 2 });
});

test('award: one tổ with two honoured options gets both placements', () => {
  const ranked = rankOptions([opt(0, 't1', 9, 0, 1), opt(1, 't1', 8, 0, 2), opt(2, 't2', 7, 0, 3)], S());
  const a = buildAward({ ranked, settings: S({ awardTop: 3, teamAward: 'place' }), roundId: 'r1' });
  assert.deepEqual(a.teams, { t1: 5, t2: 1 });
});

test('buildReveal carries names and tổ but no answer text', () => {
  const ranked = rankOptions([opt(0, 't1', 9, 0, 1)], S());
  const rv = buildReveal(buildAward({ ranked, settings: S(), roundId: 'r1' }));
  assert.equal(rv.items[0].name, 'Tên 0');
  assert.equal(rv.items[0].team, 't1');
  assert.ok(!('text' in rv.items[0]));
});

test('totals: awards across rounds plus manual adjustments (with a visible log entry each)', () => {
  const awards = {
    r1: { at: 1, teams: { t1: 7, t2: 3 }, players: { a: 7, b: 3 } },
    r2: { at: 2, teams: { t1: 2.5 }, players: { a: 2.5 } },
  };
  const adj = { k1: { team: 't2', delta: 1, at: 3 }, k2: { team: 't3', delta: -2, at: 4 }, bad: null };
  assert.deepEqual(totals(awards, adj), { t: { t1: 9.5, t2: 4, t3: -2 }, p: { a: 9.5, b: 3 } });
  assert.deepEqual(totals({}, {}), { t: {}, p: {} });
  assert.deepEqual(totals(undefined, undefined), { t: {}, p: {} });
});

test('undo the last award: the newest award is removed and totals drop by exactly that award', () => {
  const awards = {
    r1: { at: 100, teams: { t1: 7 }, players: { a: 7 } },
    r2: { at: 200, teams: { t1: 3, t2: 5 }, players: { a: 3, b: 5 } },
  };
  assert.equal(latestAwardKey(awards), 'r2');
  const { key, awards: rest, removed } = undoLastAward(awards);
  assert.equal(key, 'r2');
  assert.deepEqual(removed.teams, { t1: 3, t2: 5 });
  assert.deepEqual(totals(rest), { t: { t1: 7 }, p: { a: 7 } });
  assert.ok(awards.r2, 'input untouched');
  // undo twice, then nothing left to undo
  const again = undoLastAward(rest);
  assert.equal(again.key, 'r1');
  assert.deepEqual(totals(again.awards), { t: {}, p: {} });
  assert.equal(undoLastAward(again.awards).key, null);
  // same `at`: the later round id wins deterministically
  assert.equal(latestAwardKey({ r9: { at: 5 }, r10: { at: 5 } }), 'r9');
  // an adjustment is not an award: undo leaves it in place
  assert.deepEqual(totals(rest, { k: { team: 't1', delta: 2 } }).t, { t1: 9 });
});

test('rankBoard: ties share a rank, zero-point entries included', () => {
  const r = rankBoard({ t1: 9, t2: 9, t3: 4 }, ['t1', 't2', 't3', 't4']);
  assert.deepEqual(r.map((x) => [x.id, x.rank, x.points]), [['t1', 1, 9], ['t2', 1, 9], ['t3', 3, 4], ['t4', 4, 0]]);
});

test('countVotes: phone votes plus hand-raise counts; ignores junk and unknown voters', () => {
  const phone = { a: 0, b: 1, c: 1, d: 7, e: -1, f: 0.5, kicked: 0 };
  assert.deepEqual(countVotes({ count: 3, phoneVotes: phone, hand: [2, 0, 5], voters: new Set(['a', 'b', 'c', 'd', 'e', 'f']) }), [3, 2, 5]);
  assert.deepEqual(countVotes({ count: 2, phoneVotes: null, hand: { 0: 1, 1: 'x' } }), [1, 0]);
  assert.deepEqual(countVotes({ count: 0 }), []);
});

import { awardFromReveal } from '../../js/lib/scoring.js';
test('awardFromReveal rebuilds the award from the public reveal without recomputing points', () => {
  const ranked = rankOptions([opt(0, 't1', 9, 0, 1), opt(1, 't2', 8, 0, 2)], S());
  const original = buildAward({ ranked, settings: S({ teamAward: 'place', awardTop: 3 }), roundId: 'r4', at: 5, question: 'Q' });
  const rebuilt = awardFromReveal({ reveal: buildReveal(original), texts: { u0: 'Bài 0', u1: 'Bài 1' }, settings: S({ teamAward: 'place', awardTop: 3 }), roundId: 'r4', at: 6, question: 'Q' });
  assert.deepEqual(rebuilt.teams, original.teams);
  assert.deepEqual(rebuilt.players, original.players);
  assert.equal(rebuilt.items[0].text, 'Bài 0');
  assert.equal(rebuilt.top, 3);
  assert.deepEqual(totals({ r4: rebuilt }), totals({ r4: original }));
});
