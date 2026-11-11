// Everything the Host screens read from the database, plus the actions that write to it.
// Screens only render this; every phase change goes through lib/phases.js (transaction on `public`).
import { useMemo, useCallback, useRef } from '../../../vendor/preact-hooks.mjs';
import * as fb from '../../fb.js';
import { useDb } from '../../hooks.js';
import { toast } from '../../ui.js';
import { rp, settingUpdate } from '../../lib/room-ops.js';
import { withDefaults } from '../../lib/settings.js';
import { runTransition } from '../../lib/tx.js';
import { ERROR_TEXT } from '../../lib/phases.js';
import { buildOptions, asArray } from '../../lib/options.js';
import { normalizeBank } from '../../lib/bank.js';
import { countVotes, rankOptions, totals } from '../../lib/scoring.js';
import { makeActions } from './actions.js';

export function useHostData(code, pub) {
  const round = pub.roundId && pub.roundId !== 'r0' ? pub.roundId : null;
  const at = (p) => (round ? `rooms/${code}/${p}/${round}` : null);
  const playersQ = useDb(`rooms/${code}/players`);
  const presenceQ = useDb(`rooms/${code}/presence`);
  const repsQ = useDb(`rooms/${code}/reps`);
  const answersQ = useDb(at('answers'));
  const submittedQ = useDb(at('submitted'));
  const reviewQ = useDb(at('private/review'));
  const orderQ = useDb(at('private/order'));
  const aidQ = useDb(at('private/aid'));
  const aiQ = useDb(at('private/ai'));
  const votesQ = useDb(at('votes'));
  const handQ = useDb(at('private/hand'));
  const awardsQ = useDb(`rooms/${code}/private/awards`);
  const adjustQ = useDb(`rooms/${code}/private/adjust`);
  const bankQ = useDb(`rooms/${code}/private/bank`);
  const criteriaQ = useDb(`rooms/${code}/private/criteria`);

  const settings = useMemo(() => withDefaults(pub.settings), [pub.settings]);
  const players = playersQ.value || {};
  const answers = answersQ.value || {};
  const review = reviewQ.value || {};
  const order = useMemo(() => asArray(orderQ.value), [orderQ.value]);
  const aid = aidQ.value || {};
  const votes = votesQ.value || {};
  const hand = handQ.value || {};
  const awards = awardsQ.value || {};
  const adjust = adjustQ.value || {};

  const options = useMemo(() => buildOptions({ order, review, answers, aid, players }), [order, review, answers, aid, players]);
  const counts = useMemo(() => countVotes({ count: options.length, phoneVotes: votes, hand, voters: new Set(Object.keys(players)) }), [options.length, votes, hand, players]);
  const phoneCounts = useMemo(() => countVotes({ count: options.length, phoneVotes: votes, voters: new Set(Object.keys(players)) }), [options.length, votes, players]);
  const ranked = useMemo(
    () => rankOptions(options.map((o, i) => ({ key: o.uid, n: i, team: o.team, name: o.name, text: o.text, score: o.score, votes: counts[i] || 0, t0: o.t0 })), settings),
    [options, counts, settings],
  );
  const board = useMemo(() => totals(awards, adjust), [awards, adjust]);
  const bank = useMemo(() => normalizeBank(bankQ.value), [bankQ.value]);
  const voted = Object.keys(votes).filter((u) => players[u]).length;

  const base = {
    code, round, pub, settings, players, presence: presenceQ.value || {}, reps: repsQ.value || {}, answers, submitted: submittedQ.value || {}, review, order, aid,
    ai: aiQ.value, votes, hand, awards, adjust, bank, bankLoaded: bankQ.loaded, criteria: asArray(criteriaQ.value), options, counts, phoneCounts, ranked, board, voted,
  };
  const ref = useRef(base);
  ref.current = base;

  /** Multi-path write with a Vietnamese toast on failure. Resolves true/false. */
  const write = useCallback(async (updates) => {
    try { await fb.update(updates); return true; }
    catch (e) { toast(fb.describeError(e).text, 'error'); return false; }
  }, []);

  /** A phase change: a transaction on `public`, so two Hosts cannot both apply it. */
  const step = useCallback(async (action, args = {}, { quiet = false } = {}) => {
    try {
      const r = await runTransition({ runTransaction: (_r, fn, opts) => fb.transact(rp(code, 'public'), fn, opts), ref: null }, action, { now: fb.serverNow(), ...args });
      if (!r.ok && !quiet) toast(ERROR_TEXT[r.error] || 'Không chuyển bước được. Thử lại.', 'error');
      return r;
    } catch (e) {
      toast(fb.describeError(e).text, 'error');
      return { ok: false, error: 'exception' };
    }
  }, [code]);

  const setSetting = useCallback((key, value) => {
    const u = settingUpdate({ code, key, value });
    if (!u) { toast('Giá trị không hợp lệ.', 'error'); return Promise.resolve(false); }
    return write(u);
  }, [code, write]);
  const actions = useMemo(() => makeActions({ ref, write, step }), [write, step]);
  Object.assign(ref.current, { actions, step, write, setSetting });
  return { ...base, ref, write, step, actions, setSetting, loaded: playersQ.loaded, awardsLoaded: awardsQ.loaded && adjustQ.loaded };
}
