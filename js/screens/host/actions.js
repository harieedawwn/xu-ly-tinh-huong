// Host actions that need more than one write. All of them read the latest data through `ref` (never a stale closure).
import * as fb from '../../fb.js';
import { toast } from '../../ui.js';
import { rp, reviewUpdates, optionOfUpdates, showcaseItemsUpdate, focusUpdate, handUpdate, scoreUpdate, awardUpdates, removeAwardUpdates, boardUpdate, adjustUpdate, resetPointsUpdates, clearVotesUpdates } from '../../lib/room-ops.js';
import { A } from '../../lib/phases.js';
import { buildOptions, publicItems, toggleOrder, moveOrder, asArray } from '../../lib/options.js';
import { buildAward, buildReveal, totals, latestAwardKey, undoLastAward } from '../../lib/scoring.js';

export function makeActions({ ref, write, step }) {
  const cur = () => ref.current;

  /** Push the current options to everybody and refresh the author mapping used by the voting rule. */
  async function publish(order) {
    const c = cur();
    const options = buildOptions({ order, review: c.review, answers: c.answers, aid: c.aid, players: c.players });
    return write({
      ...showcaseItemsUpdate({ code: c.code, items: publicItems(options) }),
      ...optionOfUpdates({ code: c.code, roundId: c.round, options, players: c.players, mode: c.settings.mode }),
    });
  }

  /** Atomic change of the chosen order (two Host devices can tap at once). Resolves the resulting order. */
  async function changeOrder(fn) {
    const c = cur();
    const res = await fb.transact(rp(c.code, `private/order/${c.round}`), (v) => { const next = fn(asArray(v)); return next.length ? next : null; });
    return asArray(res.snapshot.val());
  }

  return {
    async choose(uid, st) {
      const c = cur();
      await changeOrder((o) => toggleOrder(o, uid, st === 'chosen'));
      await write(reviewUpdates({ code: c.code, roundId: c.round, uid, patch: { st: st ?? null } }));
    },
    async editText(uid, text) {
      const c = cur();
      const v = String(text ?? '').trim();
      const a = c.answers[uid];
      const patch = { edit: v && a && v !== a.text ? v.slice(0, 2000) : null };
      await write(reviewUpdates({ code: c.code, roundId: c.round, uid, patch }));
      if (c.pub.phase === 'showcase') {
        // use the edited review for the push: the listener has not fired yet, so build it by hand
        const review = { ...c.review, [uid]: { ...(c.review[uid] || {}), edit: patch.edit ?? undefined } };
        const options = buildOptions({ order: c.order, review, answers: c.answers, aid: c.aid, players: c.players });
        await write(showcaseItemsUpdate({ code: c.code, items: publicItems(options) }));
      }
    },
    async setHighlight(uid, text) {
      const c = cur();
      const v = String(text ?? '').trim().slice(0, 300);
      await write(reviewUpdates({ code: c.code, roundId: c.round, uid, patch: { hl: v || null } }));
      if (c.pub.phase === 'showcase') {
        const review = { ...c.review, [uid]: { ...(c.review[uid] || {}), hl: v } };
        const options = buildOptions({ order: c.order, review, answers: c.answers, aid: c.aid, players: c.players });
        await write(showcaseItemsUpdate({ code: c.code, items: publicItems(options) }));
      }
    },
    async setScore(uid, score) {
      const c = cur();
      await write(scoreUpdate({ code: c.code, roundId: c.round, uid, score }));
    },
    async move(uid, delta) {
      const c = cur();
      const next = await changeOrder((o) => moveOrder(o, uid, delta));
      if (c.pub.phase === 'showcase') await publish(next);
    },
    async removeOption(uid) {
      const c = cur();
      const next = await changeOrder((o) => toggleOrder(o, uid, false));
      await write(reviewUpdates({ code: c.code, roundId: c.round, uid, patch: { st: null } }));
      if (c.pub.phase === 'showcase') {
        if (!next.length) { toast('Cần ít nhất một phương án. Quay lại bước chọn bài.', 'error'); return; }
        await publish(next);
      }
    },
    /** reviewing -> showcase */
    async showcase() {
      const c = cur();
      const options = c.options;
      const r = await step(A.SHOWCASE, { items: publicItems(options) });
      if (r.ok) await write(optionOfUpdates({ code: c.code, roundId: c.round, options, players: c.players, mode: c.settings.mode }));
      return r;
    },
    async focus(i) { await write(focusUpdate({ code: cur().code, focus: i })); },
    async hand(option, delta) {
      const c = cur();
      if (delta < 0 && (Number(c.hand?.[option]) || 0) <= 0) return;
      await write(handUpdate({ code: c.code, roundId: c.round, option, delta, inc: fb.increment }));
    },
    async backToShowcase() {
      const c = cur();
      const r = await step(A.BACK_SHOWCASE, {});
      if (r.ok) await write(clearVotesUpdates({ code: c.code, roundId: c.round }));
      return r;
    },
    /** scoring -> reveal: ranks, awards points, unlocks names. */
    async reveal() {
      const c = cur();
      if (!c.ranked.length) return { ok: false };
      const award = buildAward({ ranked: c.ranked, settings: c.settings, roundId: c.round, at: fb.serverNow(), question: c.pub.question?.title || '' });
      const board = totals({ ...c.awards, [c.round]: award }, c.adjust);
      const r = await step(A.REVEAL, { reveal: buildReveal(award), board });
      if (r.ok) await write(awardUpdates({ code: c.code, roundId: c.round, award, board }));
      return r;
    },
    /** Undo the most recent award (any round). If it belongs to the round on screen, go back to scoring. */
    async undoAward() {
      const c = cur();
      const key = latestAwardKey(c.awards);
      if (!key) { toast('Chưa có lần công bố nào để hoàn tác.'); return { ok: false }; }
      const { awards: rest } = undoLastAward(c.awards);
      const board = totals(rest, c.adjust);
      if (key === c.round && (c.pub.phase === 'reveal' || c.pub.phase === 'leaderboard')) {
        const r = await step(A.UNREVEAL, { board });
        if (!r.ok) return r;
      }
      await write(removeAwardUpdates({ code: c.code, roundId: key, board }));
      return { ok: true, key };
    },
    async adjust(team, delta, note) {
      const c = cur();
      const key = fb.pushKey(rp(c.code, 'private/adjust'));
      await write(adjustUpdate({ code: c.code, key, team, delta, at: fb.serverNow(), note }));
    },
    async resetPoints() {
      await write({ ...resetPointsUpdates({ code: cur().code }) });
    },
    async syncBoard(board) {
      const c = cur();
      const empty = !Object.keys(board.t).length && !Object.keys(board.p).length;
      await write(empty ? { [rp(c.code, 'public/board')]: null } : boardUpdate({ code: c.code, board }));
    },
    publish,
  };
}
