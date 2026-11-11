import test from 'node:test';
import assert from 'node:assert/strict';
import { transition, A, TABLE, PHASES, can, actionsFrom, hasUndefined } from '../../js/lib/phases.js';
import { runTransition } from '../../js/lib/tx.js';
import { idleTimer } from '../../js/lib/timer.js';

const Q = { id: 'b1', title: 'Tình huống', text: 'Nội dung tình huống đủ dài.' };
const lobby = () => ({ phase: 'lobby', roundId: 'r0', roundNo: 0, settings: { mode: 'all' }, timer: idleTimer(0) });
const ok = (pub, a, args) => { const r = transition(pub, a, args); assert.ok(r.ok, `${a} from ${pub.phase}: ${r.error}`); assert.ok(!hasUndefined(r.pub), `${a} produced undefined`); return r.pub; };
const items = [{ text: 'Một', hl: 'm' }, { text: 'Hai', hl: '' }, { text: 'Ba' }];

function walkToScoring(voting = true) {
  let p = ok(lobby(), A.START, { question: Q, durationMs: 60_000, now: 1000 });
  p = ok(p, A.LOCK); p = ok(p, A.REVIEW);
  p = ok(p, A.SHOWCASE, { items });
  p = voting ? ok(ok(p, A.OPEN_VOTING, { phone: true }), A.CLOSE_VOTING) : ok(p, A.SKIP_VOTING);
  return p;
}

test('happy path through every phase, with voting and without', () => {
  let p = walkToScoring(true);
  assert.equal(p.phase, 'scoring');
  assert.equal(p.vote.open, false);
  p = ok(p, A.REVEAL, { reveal: { top: 1, items: [{ n: 0, rank: 1 }] }, board: { t: { t1: 5 }, p: {} } });
  assert.equal(p.phase, 'reveal');
  assert.equal(p.reveal.roundId, 'r1');
  p = ok(p, A.LEADERBOARD);
  assert.equal(p.phase, 'leaderboard');
  p = ok(p, A.NEXT);
  assert.equal(p.phase, 'lobby');
  assert.ok(!p.showcase && !p.vote && !p.reveal, 'round state cleared');
  assert.equal(p.board.t.t1, 5, 'board survives into the next round');
  assert.equal(p.roundNo, 1);
  assert.equal(walkToScoring(false).vote.skipped, true);
});

test('start: new round id and number, timer running, previous round cleared', () => {
  const first = walkToScoring();
  const next = ok(ok(first, A.ABANDON), A.START, { question: Q, durationMs: 90_000, now: 5000 });
  assert.equal(next.roundId, 'r2');
  assert.equal(next.roundNo, 2);
  assert.deepEqual(next.timer, { state: 'running', durationMs: 90_000, endsAt: 95_000 });
  assert.ok(!next.showcase && !next.vote);
});

test('guards: start needs a valid duration and a question', () => {
  assert.equal(transition(lobby(), A.START, { question: Q, durationMs: 5_000, now: 0 }).error, 'badDuration');
  assert.equal(transition(lobby(), A.START, { question: Q, durationMs: 4_000_000, now: 0 }).error, 'badDuration');
  assert.equal(transition(lobby(), A.START, { question: { title: '', text: '' }, durationMs: 60_000, now: 0 }).error, 'noQuestion');
});

test('every action is refused outside its source phases', () => {
  for (const phase of PHASES) {
    for (const [a, t] of Object.entries(TABLE)) {
      if (t.from.includes(phase)) continue;
      const r = transition({ ...lobby(), phase }, a, { question: Q, durationMs: 60_000, now: 0, items, reveal: { items: [{}] } });
      assert.equal(r.ok, false, `${a} must be refused from ${phase}`);
      assert.equal(r.error, 'wrongPhase');
    }
  }
  assert.equal(transition(lobby(), 'nope').error, 'unknown');
  assert.equal(transition(null, A.LOCK).ok, false);
});

test('showcase needs at least one real item; voting needs two options', () => {
  let p = ok(ok(ok(lobby(), A.START, { question: Q, durationMs: 60_000, now: 0 }), A.LOCK), A.REVIEW);
  assert.equal(transition(p, A.SHOWCASE, { items: [] }).error, 'noItems');
  assert.equal(transition(p, A.SHOWCASE, { items: [{ text: '  ' }] }).error, 'noItems');
  assert.equal(transition(p, A.SHOWCASE, { items: Array.from({ length: 13 }, (_, i) => ({ text: `t${i}` })) }).error, 'tooMany');
  p = ok(p, A.SHOWCASE, { items: [{ text: 'Chỉ một' }] });
  assert.equal(p.showcase.focus, null);
  assert.equal(transition(p, A.OPEN_VOTING, { phone: true }).error, 'needTwo');
  assert.equal(ok(p, A.SKIP_VOTING).phase, 'scoring');
});

test('stepping back: reopen answering, back from review, reopen voting, back to showcase', () => {
  let p = ok(ok(lobby(), A.START, { question: Q, durationMs: 60_000, now: 0 }), A.LOCK);
  p = ok(p, A.REOPEN, { durationMs: 45_000, now: 9000 });
  assert.equal(p.phase, 'answering');
  assert.equal(p.timer.endsAt, 54_000);
  p = ok(ok(ok(p, A.LOCK), A.REVIEW), A.BACK_LOCKED);
  assert.equal(p.phase, 'locked');
  assert.equal(transition(ok(p, A.REVIEW), A.SHOWCASE, {}).error, 'noItems');
});

test('stepping back with data: showcase->review drops showcase; voting->showcase drops the vote; scoring->voting reopens', () => {
  let p = walkToScoring(false);
  p = ok(p, A.REOPEN_VOTING, { phone: true, live: true });
  assert.equal(p.phase, 'voting');
  assert.equal(p.vote.open, true);
  assert.equal(p.vote.skipped, undefined);
  assert.equal(p.vote.live, true);
  p = ok(p, A.BACK_SHOWCASE);
  assert.equal(p.phase, 'showcase');
  assert.ok(!p.vote);
  assert.equal(p.showcase.items.length, 3);
  p = ok(p, A.BACK_REVIEW);
  assert.equal(p.phase, 'reviewing');
  assert.ok(!p.showcase);
});

test('vote open/close toggles only in voting and keeps the count', () => {
  let p = ok(walkToScoring(true), A.REOPEN_VOTING, { phone: false });
  assert.equal(p.vote.open, false);
  p = ok(p, A.SET_VOTE_OPEN, { open: true });
  assert.equal(p.vote.open, true);
  assert.equal(p.vote.count, 3);
  assert.equal(p.phase, 'voting');
  assert.equal(transition(walkToScoring(true), A.SET_VOTE_OPEN, { open: true }).error, 'wrongPhase');
});

test('reveal needs data; unreveal (undo) returns to scoring and restores/removes the board', () => {
  const sc = walkToScoring();
  assert.equal(transition(sc, A.REVEAL, { reveal: { items: [] } }).error, 'noRevealData');
  assert.equal(transition(sc, A.REVEAL, {}).error, 'noRevealData');
  const rv = ok(sc, A.REVEAL, { reveal: { top: 3, items: [{ n: 0 }] }, board: { t: { t2: 7 }, p: { u1: 7 } } });
  const un = ok(rv, A.UNREVEAL, { board: { t: {}, p: {} } });
  assert.equal(un.phase, 'scoring');
  assert.ok(!un.reveal);
  assert.deepEqual(un.board, { t: {}, p: {} });
  const lb = ok(rv, A.LEADERBOARD);
  assert.equal(ok(lb, A.UNREVEAL, {}).board, undefined);
  assert.equal(ok(lb, A.BACK_REVEAL).phase, 'reveal');
  assert.equal(ok(rv, A.NEXT).phase, 'lobby');
});

test('abandon returns to the lobby from any live phase, keeping the round counter', () => {
  for (const phase of ['answering', 'locked', 'reviewing', 'showcase', 'voting', 'scoring']) {
    const r = transition({ ...lobby(), phase, roundNo: 4, roundId: 'r4', showcase: { items }, vote: { open: true, count: 3 } }, A.ABANDON);
    assert.equal(r.pub.phase, 'lobby');
    assert.equal(r.pub.roundNo, 4);
    assert.ok(!r.pub.showcase && !r.pub.vote);
  }
});

test('transition never mutates its input', () => {
  const p = Object.freeze({ ...walkToScoring(), showcase: Object.freeze({ items }) });
  const before = JSON.stringify(p);
  transition(p, A.REVEAL, { reveal: { items: [{}] } });
  transition(p, A.REOPEN_VOTING, { phone: true });
  assert.equal(JSON.stringify(p), before);
});

test('can / actionsFrom', () => {
  assert.ok(can({ phase: 'locked' }, A.REVIEW));
  assert.ok(!can({ phase: 'locked' }, A.LOCK));
  assert.deepEqual(actionsFrom('lobby'), [A.START]);
});

/* ---- two hosts racing: a fake database whose transaction serialises like the real one ---- */
function fakeDb(initial) {
  let value = initial;
  let queue = Promise.resolve();
  const runTransaction = (_ref, update) => {
    const p = queue.then(async () => {
      await Promise.resolve(); // yield: both hosts read before either commits
      const next = update(JSON.parse(JSON.stringify(value)));
      if (next === undefined) return { committed: false };
      value = JSON.parse(JSON.stringify(next));
      return { committed: true };
    });
    queue = p.catch(() => {});
    return p;
  };
  return { runTransaction, get: () => value };
}

test('two hosts press the same step at once: exactly one wins, state is not corrupted', async () => {
  const db = fakeDb(walkToScoring());
  const sdk = { runTransaction: db.runTransaction, ref: 'public' };
  const args = { reveal: { top: 1, items: [{ n: 0 }] }, board: { t: {}, p: {} } };
  const [a, b] = await Promise.all([runTransition(sdk, A.REVEAL, args), runTransition(sdk, A.REVEAL, args)]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  const loser = [a, b].find((r) => !r.ok);
  assert.equal(loser.error, 'wrongPhase');
  assert.equal(db.get().phase, 'reveal');
});

test('racing different steps: only the one legal from the current phase applies', async () => {
  const db = fakeDb(walkToScoring());
  const sdk = { runTransaction: db.runTransaction, ref: 'public' };
  const r = await Promise.all([
    runTransition(sdk, A.REVEAL, { reveal: { items: [{ n: 0 }] } }),
    runTransition(sdk, A.REOPEN_VOTING, { phone: true }),
  ]);
  assert.equal(r.filter((x) => x.ok).length, 1);
  assert.ok(['reveal', 'voting'].includes(db.get().phase));
});

test('runTransition reports a missing room', async () => {
  const db = fakeDb(null);
  const r = await runTransition({ runTransaction: db.runTransaction, ref: 'x' }, A.LOCK, {});
  assert.equal(r.ok, false);
  assert.equal(r.error, 'noRoom');
});
