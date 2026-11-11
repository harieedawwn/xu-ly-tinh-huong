// The showcased options: derived from the answers, the review docs and the chosen order. Pure.
export const asArray = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => Number(a) - Number(b)).map((k) => v[k]) : []);

/**
 * Options in showcase order. Answers whose author has left the room are dropped (their tổ is unknown).
 * `text` is the edited display text when there is one; `orig` is always the student's own words.
 */
export function buildOptions({ order, review, answers, aid, players }) {
  const out = [];
  for (const uid of asArray(order)) {
    const a = answers?.[uid];
    const p = players?.[uid];
    if (!a || !p) continue;
    const rv = review?.[uid] || {};
    const edit = typeof rv.edit === 'string' ? rv.edit.trim() : '';
    const edited = !!edit && edit !== a.text;
    out.push({
      uid, id: aid?.[uid] ?? null, team: p.team, name: p.name, orig: a.text, text: edited ? edit : a.text, edited,
      hl: rv.hl || '', score: typeof rv.score === 'number' ? rv.score : null, ai: typeof rv.ai === 'number' ? rv.ai : null,
      reason: rv.reason || '', t0: a.t0 ?? a.ts ?? 0,
    });
  }
  return out.map((o, n) => ({ ...o, n }));
}

/** What everybody sees: text and highlight only. */
export const publicItems = (options) => options.map((o) => ({ text: o.text, hl: o.hl }));

export function toggleOrder(order, uid, on) {
  const cur = asArray(order).filter((u) => u !== uid);
  return on ? [...cur, uid] : cur;
}

export function moveOrder(order, uid, delta) {
  const cur = asArray(order);
  const i = cur.indexOf(uid);
  if (i < 0) return cur;
  const j = Math.min(cur.length - 1, Math.max(0, i + delta));
  if (j === i) return cur;
  const next = cur.slice();
  next.splice(i, 1);
  next.splice(j, 0, uid);
  return next;
}

export const pruneOrder = (order, answers) => asArray(order).filter((u) => answers?.[u]);
