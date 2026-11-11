// Scoring, ranking, tie-breaks, awards, leaderboards and undo. Pure.
//
// An "option" is one showcased answer: { key (author uid), n (0-based option index), score (host score or null),
//                                          votes (hand + phone), t0 (first-submit instant), team }
//
// Formulas (settings.formula):
//   host  -> final = host score
//   mix   -> final = (1 - w) * host score + w * vote points            w = voteWeight / 100
//   votes -> final = vote points
// vote points = maxScore * votes / (highest vote count among the options)   (the most-voted option earns the full mark)
// Ranking: final desc, then host score desc, then votes desc, then earlier submission (t0 asc), then option order.

export const PLACE_POINTS = Object.freeze([3, 2, 1]);

export const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

/** Clamp to [0, max] and snap to the step (0.5 or 1). Empty or invalid -> null. */
export function snapScore(v, step = 0.5, max = 10) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  if (!Number.isFinite(n)) return null;
  const s = Math.round(n / step) * step;
  return Math.min(max, Math.max(0, round2(s)));
}

export function votePoints(votes, maxVotes, maxScore) {
  if (!(maxVotes > 0)) return 0;
  return (maxScore * votes) / maxVotes;
}

export function finalValue({ hostScore, votePts }, { formula = 'host', voteWeight = 50 } = {}) {
  if (formula === 'votes') return round2(votePts);
  if (formula === 'mix') {
    const w = Math.min(1, Math.max(0, voteWeight / 100));
    return round2((1 - w) * hostScore + w * votePts);
  }
  return round2(hostScore);
}

/**
 * @returns options sorted best-first with { hostScore, votePts, value, rank } added. Ranks are strictly 1..n
 * because the last tie-break (submission time, then option order) always separates two options.
 */
export function rankOptions(options, settings = {}) {
  const maxScore = settings.maxScore ?? 10;
  const maxVotes = Math.max(0, ...options.map((o) => o.votes || 0));
  const rows = options.map((o) => {
    const hostScore = o.score == null ? 0 : o.score;
    const votes = o.votes || 0;
    const votePts = votePoints(votes, maxVotes, maxScore);
    return { ...o, votes, hostScore, votePts: round2(votePts), value: finalValue({ hostScore, votePts }, settings) };
  });
  rows.sort((a, b) =>
    (b.value - a.value) || (b.hostScore - a.hostScore) || (b.votes - a.votes) ||
    ((a.t0 ?? Infinity) - (b.t0 ?? Infinity)) || (a.n - b.n));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** True when two neighbours in the ranking were separated only by the submission-time tie-break. */
export const tiedOnPoints = (a, b) => a.value === b.value && a.hostScore === b.hostScore && a.votes === b.votes;

/**
 * Points earned by the ranked options.
 *   teamAward 'sum'   : every showcased option earns its final value (the tổ total is the sum of its options)
 *   teamAward 'place' : only the honoured top N earn placement points 3/2/1
 * `top` (1 or 3) is how many are honoured on the reveal.
 */
export function buildAward({ ranked, settings, roundId, at = 0, question = '' }) {
  const top = settings.awardTop === 3 ? 3 : 1;
  const method = settings.teamAward === 'place' ? 'place' : 'sum';
  const items = ranked.map((o) => {
    const honoured = o.rank <= top;
    const points = method === 'sum' ? o.value : honoured ? PLACE_POINTS[o.rank - 1] : 0;
    return { n: o.n, uid: o.key, team: o.team, name: o.name ?? '', text: o.text ?? '', hostScore: o.hostScore, votes: o.votes, value: o.value, rank: o.rank, honoured, points: round2(points) };
  });
  const teams = {};
  const players = {};
  for (const it of items) {
    if (!it.points) continue;
    if (it.team) teams[it.team] = round2((teams[it.team] || 0) + it.points);
    players[it.uid] = round2((players[it.uid] || 0) + it.points);
  }
  return { roundId, question, at, top, method, maxScore: settings.maxScore ?? 10, formula: settings.formula ?? 'host', items, teams, players };
}

/** Public reveal payload: names and tổ unlock here (and nowhere earlier). Text stays in public/showcase. */
export function buildReveal(award) {
  return {
    top: award.top,
    items: award.items.map(({ n, uid, team, name, hostScore, votes, value, rank, honoured, points }) => ({ n, uid, team, name, hostScore, votes, value, rank, honoured, points })),
  };
}

/** Leaderboard totals from the awards (keyed by round) and manual adjustments (keyed by push id). */
export function totals(awards = {}, adjustments = {}) {
  const t = {};
  const p = {};
  for (const a of Object.values(awards || {})) {
    for (const [k, v] of Object.entries(a.teams || {})) t[k] = round2((t[k] || 0) + v);
    for (const [k, v] of Object.entries(a.players || {})) p[k] = round2((p[k] || 0) + v);
  }
  for (const adj of Object.values(adjustments || {})) {
    if (!adj || !adj.team) continue;
    t[adj.team] = round2((t[adj.team] || 0) + (Number(adj.delta) || 0));
  }
  return { t, p };
}

/** Sort a {id: points} map; equal points share a rank (1, 1, 3). `ids` adds zero-point entries. */
export function rankBoard(map = {}, ids = []) {
  const all = { ...Object.fromEntries(ids.map((i) => [i, 0])), ...map };
  const rows = Object.entries(all).map(([id, points]) => ({ id, points })).sort((a, b) => (b.points - a.points) || (a.id < b.id ? -1 : 1));
  let prev = null; let rank = 0;
  return rows.map((r, i) => { if (prev === null || r.points !== prev) { rank = i + 1; prev = r.points; } return { ...r, rank }; });
}

/** Key of the most recent award (by `at`, then round id), or null. */
export function latestAwardKey(awards = {}) {
  let best = null;
  for (const [k, a] of Object.entries(awards || {})) {
    if (!best || (a.at || 0) > (awards[best].at || 0) || ((a.at || 0) === (awards[best].at || 0) && k > best)) best = k;
  }
  return best;
}

/** Undo the last award: returns the remaining awards and what was removed. */
export function undoLastAward(awards = {}) {
  const key = latestAwardKey(awards);
  if (!key) return { key: null, awards: { ...awards }, removed: null };
  const rest = { ...awards };
  const removed = rest[key];
  delete rest[key];
  return { key, awards: rest, removed };
}

/** Per-option vote totals = phone votes (from votes/{round}) + hand-raise counts. Ignores non-integers and unknown voters. */
export function countVotes({ count, phoneVotes = {}, hand = {}, voters = null }) {
  const out = Array.from({ length: count }, () => 0);
  for (const [uid, v] of Object.entries(phoneVotes || {})) {
    if (voters && !voters.has(uid)) continue;
    if (Number.isInteger(v) && v >= 0 && v < count) out[v] += 1;
  }
  for (let i = 0; i < count; i++) {
    const h = Number(Array.isArray(hand) ? hand[i] : hand?.[i]);
    if (Number.isInteger(h) && h > 0) out[i] += h;
  }
  return out;
}

/**
 * Rebuild an award from the public reveal (used when the reveal was published but the award write was lost,
 * e.g. the Host's connection dropped between the two). Points are taken from the reveal, never recomputed.
 */
export function awardFromReveal({ reveal, texts = {}, settings = {}, roundId, at = 0, question = '' }) {
  const items = Object.values(reveal?.items || {}).sort((a, b) => a.rank - b.rank).map((it) => ({ ...it, text: texts[it.uid] ?? '' }));
  const teams = {};
  const players = {};
  for (const it of items) {
    if (!it.points) continue;
    if (it.team) teams[it.team] = round2((teams[it.team] || 0) + it.points);
    if (it.uid) players[it.uid] = round2((players[it.uid] || 0) + it.points);
  }
  return { roundId, question, at, top: reveal?.top === 3 ? 3 : 1, method: settings.teamAward === 'place' ? 'place' : 'sum', maxScore: settings.maxScore ?? 10, formula: settings.formula ?? 'host', items, teams, players };
}
