// The round phase machine. Pure functions only: screens render state, they never decide transitions.
//
//   lobby -> answering -> locked -> reviewing -> showcase -> voting -> scoring -> reveal -> leaderboard -> lobby
//                                                      \________________/ (voting can be skipped)
//
// `transition(pub, action, args)` takes the whole `public` node and returns the next one, or an error.
// The app runs it inside a database transaction on `rooms/{code}/public` (see lib/tx.js), so two hosts
// on two devices cannot both apply the same step: the loser's transaction aborts and it re-reads the state.
import { startTimer, idleTimer } from './timer.js';

export const PHASES = ['lobby', 'answering', 'locked', 'reviewing', 'showcase', 'voting', 'scoring', 'reveal', 'leaderboard'];

export const A = Object.freeze({
  START: 'start', LOCK: 'lock', REOPEN: 'reopen', REVIEW: 'review', BACK_LOCKED: 'backLocked',
  SHOWCASE: 'showcase', BACK_REVIEW: 'backReview',
  OPEN_VOTING: 'openVoting', SKIP_VOTING: 'skipVoting', CLOSE_VOTING: 'closeVoting', REOPEN_VOTING: 'reopenVoting', BACK_SHOWCASE: 'backShowcase',
  SET_VOTE_OPEN: 'setVoteOpen',
  REVEAL: 'reveal', UNREVEAL: 'unreveal', LEADERBOARD: 'leaderboard', BACK_REVEAL: 'backReveal',
  NEXT: 'next', ABANDON: 'abandon',
});

/** action -> { from: [phases], to: phase } ; `to` equal to the current phase means "stay". */
export const TABLE = Object.freeze({
  [A.START]: { from: ['lobby'], to: 'answering' },
  [A.LOCK]: { from: ['answering'], to: 'locked' },
  [A.REOPEN]: { from: ['locked'], to: 'answering' },
  [A.REVIEW]: { from: ['locked'], to: 'reviewing' },
  [A.BACK_LOCKED]: { from: ['reviewing'], to: 'locked' },
  [A.SHOWCASE]: { from: ['reviewing'], to: 'showcase' },
  [A.BACK_REVIEW]: { from: ['showcase'], to: 'reviewing' },
  [A.OPEN_VOTING]: { from: ['showcase'], to: 'voting' },
  [A.SKIP_VOTING]: { from: ['showcase'], to: 'scoring' },
  [A.CLOSE_VOTING]: { from: ['voting'], to: 'scoring' },
  [A.REOPEN_VOTING]: { from: ['scoring'], to: 'voting' },
  [A.BACK_SHOWCASE]: { from: ['voting'], to: 'showcase' },
  [A.SET_VOTE_OPEN]: { from: ['voting'], to: 'voting' },
  [A.REVEAL]: { from: ['scoring'], to: 'reveal' },
  [A.UNREVEAL]: { from: ['reveal', 'leaderboard'], to: 'scoring' },
  [A.LEADERBOARD]: { from: ['reveal'], to: 'leaderboard' },
  [A.BACK_REVEAL]: { from: ['leaderboard'], to: 'reveal' },
  [A.NEXT]: { from: ['reveal', 'leaderboard'], to: 'lobby' },
  [A.ABANDON]: { from: ['answering', 'locked', 'reviewing', 'showcase', 'voting', 'scoring'], to: 'lobby' },
});

export const MIN_DURATION_MS = 10_000;
export const MAX_DURATION_MS = 3_600_000;
export const MAX_SHOWCASE = 12;

const fail = (error, extra = {}) => ({ ok: false, error, ...extra });
const without = (obj, ...keys) => { const o = { ...obj }; keys.forEach((k) => delete o[k]); return o; };

/** Actions that are legal from the given phase (drives which buttons are enabled). */
export const actionsFrom = (phase) => Object.keys(TABLE).filter((a) => TABLE[a].from.includes(phase));
export const can = (pub, action) => !!TABLE[action] && TABLE[action].from.includes(pub?.phase);

const cleanItems = (items) => (Array.isArray(items) ? items : [])
  .filter((it) => it && typeof it.text === 'string' && it.text.trim())
  .map((it) => ({ text: it.text, hl: typeof it.hl === 'string' ? it.hl : '' }));

/** The slice of state that belongs to one round and must not leak into the next. */
const clearRound = (pub) => without(pub, 'showcase', 'vote', 'reveal');

/**
 * @param {object} pub    current `public` node
 * @param {string} action one of A
 * @param {object} args   action arguments (see each case)
 * @returns {{ok:true,pub:object}|{ok:false,error:string}}
 */
export function transition(pub, action, args = {}) {
  const t = TABLE[action];
  if (!t) return fail('unknown');
  if (!pub || !t.from.includes(pub.phase)) return fail('wrongPhase', { from: pub?.phase ?? null });
  const base = { ...pub };
  const set = (patch) => ({ ok: true, pub: { ...base, ...patch, phase: t.to } });

  switch (action) {
    case A.START: {
      const d = Math.round(args.durationMs);
      if (!(d >= MIN_DURATION_MS && d <= MAX_DURATION_MS)) return fail('badDuration');
      const q = args.question;
      if (!q || !String(q.title || '').trim() || !String(q.text || '').trim()) return fail('noQuestion');
      const roundNo = (pub.roundNo || 0) + 1;
      return { ok: true, pub: { ...clearRound(base), phase: 'answering', roundNo, roundId: `r${roundNo}`, question: { id: q.id ?? null, title: q.title, text: q.text }, timer: startTimer(d, args.now) } };
    }
    case A.LOCK:
      return set({});
    case A.REOPEN: {
      const d = Math.round(args.durationMs ?? 60_000);
      if (!(d >= MIN_DURATION_MS && d <= MAX_DURATION_MS)) return fail('badDuration');
      return set({ timer: startTimer(d, args.now) });
    }
    case A.REVIEW:
    case A.BACK_LOCKED:
      return set({});
    case A.SHOWCASE: {
      const items = cleanItems(args.items);
      if (items.length < 1) return fail('noItems');
      if (items.length > MAX_SHOWCASE) return fail('tooMany');
      return set({ showcase: { roundId: pub.roundId, items, focus: null } });
    }
    case A.BACK_REVIEW:
      return { ok: true, pub: { ...without(base, 'showcase', 'vote'), phase: 'reviewing' } };
    case A.OPEN_VOTING: {
      const n = pub.showcase?.items?.length || 0;
      if (n < 2) return fail('needTwo');
      return set({ vote: { open: !!args.phone, count: n, live: !!args.live, n: 0 } });
    }
    case A.SKIP_VOTING: {
      const n = pub.showcase?.items?.length || 0;
      return set({ vote: { open: false, count: n, live: false, n: 0, skipped: true } });
    }
    case A.CLOSE_VOTING:
      return set({ vote: { ...(pub.vote || { count: 0 }), open: false } });
    case A.REOPEN_VOTING: {
      const n = pub.showcase?.items?.length || 0;
      if (n < 2) return fail('needTwo');
      return set({ vote: { ...without(pub.vote || {}, 'skipped'), open: !!args.phone, count: n, live: !!args.live } });
    }
    case A.BACK_SHOWCASE:
      return { ok: true, pub: { ...without(base, 'vote'), phase: 'showcase' } };
    case A.SET_VOTE_OPEN:
      return set({ vote: { ...(pub.vote || { count: 0 }), open: !!args.open } });
    case A.REVEAL: {
      const items = args.reveal?.items;
      if (!Array.isArray(items) || items.length < 1) return fail('noRevealData');
      return set({ reveal: { ...args.reveal, roundId: pub.roundId }, board: args.board ?? pub.board ?? { t: {}, p: {} } });
    }
    case A.UNREVEAL: {
      const next = { ...without(base, 'reveal'), phase: 'scoring' };
      if (args.board) next.board = args.board; else delete next.board;
      return { ok: true, pub: next };
    }
    case A.LEADERBOARD:
    case A.BACK_REVEAL:
      return set({});
    case A.NEXT:
    case A.ABANDON:
      return { ok: true, pub: { ...clearRound(base), phase: 'lobby', timer: idleTimer(0) } };
    default:
      return fail('unknown');
  }
}

/** True when the object (deeply) contains `undefined`, which the database SDK refuses to write. */
export function hasUndefined(v) {
  if (v === undefined) return true;
  if (v && typeof v === 'object') return Object.values(v).some(hasUndefined);
  return false;
}

/** Vietnamese copy for a refused transition (the UI shows it as a toast). */
export const ERROR_TEXT = {
  wrongPhase: 'Trạng thái phòng vừa thay đổi (có thể từ thiết bị Host khác). Đã cập nhật lại.',
  badDuration: 'Thời gian từ 10 giây đến 60 phút.',
  noQuestion: 'Chọn một tình huống trước.',
  noItems: 'Chọn ít nhất một bài để chiếu.',
  tooMany: `Chỉ chiếu tối đa ${MAX_SHOWCASE} phương án.`,
  needTwo: 'Bình chọn cần ít nhất 2 phương án.',
  noRevealData: 'Chưa có kết quả để công bố.',
  unknown: 'Thao tác không hợp lệ.',
};
