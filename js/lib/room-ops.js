// Pure builders for every database write the app performs. No Firebase imports: the server-timestamp
// sentinel is passed in, so the SAME payloads are exercised by tools/rules-test.mjs against the real rules.
import { defaultTeams } from './teams.js';
import { startTimer, extendTimer, pauseTimer, resumeTimer, idleTimer } from './timer.js';
import { DEFAULT_SETTINGS, sanitizeSetting } from './settings.js';

export const rp = (code, path = '') => `rooms/${code}${path ? '/' + path : ''}`;

export { DEFAULT_SETTINGS };

/** Atomic creation: host membership + secret PIN + public state. `updates` is applied at the database root. */
export function createRoomUpdates({ code, uid, pin, ts, teamCount = 4 }) {
  return {
    [rp(code, `hostUids/${uid}`)]: true,
    [`secrets/${code}/pin`]: pin,
    [rp(code, 'public')]: {
      phase: 'lobby',
      roundId: 'r0',
      roundNo: 0,
      createdAt: ts,
      settings: { ...DEFAULT_SETTINGS, teams: defaultTeams(teamCount) },
      timer: idleTimer(0),
    },
  };
}

export const joinRecord = ({ name, team, ts }) => ({ name, team, joinedAt: ts });

/** Host starts a round. Replaces question + timer in one multi-path write. */
export function startRoundUpdates({ code, roundNo, question, durationMs, nowServer }) {
  const roundId = `r${roundNo + 1}`;
  return {
    roundId,
    updates: {
      [rp(code, 'public/phase')]: 'answering',
      [rp(code, 'public/roundId')]: roundId,
      [rp(code, 'public/roundNo')]: roundNo + 1,
      [rp(code, 'public/question')]: { id: question.id ?? null, title: question.title, text: question.text },
      [rp(code, 'public/timer')]: startTimer(durationMs, nowServer),
      [rp(code, 'private/criteria')]: question.criteria ?? [],
    },
  };
}

export const lockUpdates = ({ code }) => ({ [rp(code, 'public/phase')]: 'locked' });

/** Back to answering with fresh time (reopen). */
export const reopenUpdates = ({ code, durationMs, nowServer }) => ({
  [rp(code, 'public/phase')]: 'answering',
  [rp(code, 'public/timer')]: startTimer(durationMs, nowServer),
});

export const backToLobbyUpdates = ({ code }) => ({
  [rp(code, 'public/phase')]: 'lobby',
  [rp(code, 'public/timer')]: idleTimer(0),
});

export const timerUpdate = ({ code, timer }) => ({ [rp(code, 'public/timer')]: timer });
export const extendTimerUpdate = ({ code, timer, addMs, nowServer }) => timerUpdate({ code, timer: extendTimer(timer, addMs, nowServer) });
export const pauseTimerUpdate = ({ code, timer, nowServer }) => timerUpdate({ code, timer: pauseTimer(timer, nowServer) });
export const resumeTimerUpdate = ({ code, timer, nowServer }) => timerUpdate({ code, timer: resumeTimer(timer, nowServer) });

/** A player submits (or edits) their answer; `t0` is the first-submit instant, kept on edits. */
export function submitUpdates({ code, roundId, uid, text, ts, t0 }) {
  return {
    [rp(code, `answers/${roundId}/${uid}`)]: { text, ts, t0: t0 ?? ts },
    [rp(code, `submitted/${roundId}/${uid}`)]: true,
  };
}

/** Kick = ban + remove from roster + free their representative slot. */
export function kickUpdates({ code, uid, teamId, repUid }) {
  const u = {
    [rp(code, `banned/${uid}`)]: true,
    [rp(code, `players/${uid}`)]: null,
    [rp(code, `presence/${uid}`)]: null,
  };
  if (teamId && repUid === uid) u[rp(code, `reps/${teamId}`)] = null;
  return u;
}

/** Ending a room deletes all its data and the secret. Both paths are evaluated against the pre-write host record. */
export const endRoomUpdates = ({ code }) => ({ [rp(code)]: null, [`secrets/${code}`]: null });

/** One PIN guess. The counter must go up by exactly one per guess (rules cap it at 8). */
export const claimGuessUpdates = ({ code, uid, pin, tries }) => ({
  [rp(code, `hostClaims/${uid}`)]: pin,
  [rp(code, `claimTries/${uid}`)]: tries + 1,
});

export const MAX_CLAIM_TRIES = 8;

/* =====================================================================================================
   Stage 2. Phase changes go through lib/phases.js + lib/tx.js (a transaction on `public`); everything
   below is a plain multi-path update on the other paths. `null` removes a path.
   ===================================================================================================== */

/** One setting. Returns null when the value is not allowed (the rules would refuse it too). */
export function settingUpdate({ code, key, value }) {
  const v = sanitizeSetting(key, value);
  return v.ok ? { [rp(code, `public/settings/${key}`)]: v.value } : null;
}

/** Tổ count / names. `moves` are players whose tổ disappears; they move in the SAME update so no one is left in a missing tổ. */
export function teamsUpdates({ code, teams, moves = [], removed = [] }) {
  const u = { [rp(code, 'public/settings/teams')]: teams };
  for (const m of moves) u[rp(code, `players/${m.uid}/team`)] = m.to;
  for (const m of moves) u[rp(code, `reps/${m.from}`)] = null;
  for (const t of removed) u[rp(code, `reps/${t}`)] = null;
  return u;
}

export const renamePlayerUpdates = ({ code, uid, name }) => ({ [rp(code, `players/${uid}/name`)]: name });
export const movePlayerUpdates = ({ code, uid, team, repOf }) => {
  const u = { [rp(code, `players/${uid}/team`)]: team };
  if (repOf) u[rp(code, `reps/${repOf}`)] = null; // a representative who changes tổ gives up the slot
  return u;
};
export const repUpdates = ({ code, teamId, uid }) => ({ [rp(code, `reps/${teamId}`)]: uid ?? null });
export const badWordsUpdate = ({ code, words }) => ({ [rp(code, 'public/settings/badWords')]: words.length ? words : null });

/** Question bank (whole array; edited through a transaction in the app). */
export const bankUpdate = ({ code, bank }) => ({ [rp(code, 'private/bank')]: bank });

/** Per-answer review state: st (chosen|rejected|null), hl, ai (suggested score), score, reason, edit. */
export function reviewUpdates({ code, roundId, uid, patch }) {
  const u = {};
  for (const [k, v] of Object.entries(patch)) u[rp(code, `private/review/${roundId}/${uid}/${k}`)] = v === undefined ? null : v;
  return u;
}
export const orderUpdate = ({ code, roundId, order }) => ({ [rp(code, `private/order/${roundId}`)]: order.length ? order : null });
export const aidUpdate = ({ code, roundId, map }) => ({ [rp(code, `private/aid/${roundId}`)]: map });

/** Import of a parsed AI reply: selection, highlights, prefilled scores, order and the stored script. */
export function aiImportUpdates({ code, roundId, parsed, uidOf, at, previouslyChosen = [] }) {
  const u = {};
  const order = [];
  const field = (uid, k, v) => { u[rp(code, `private/review/${roundId}/${uid}/${k}`)] = v ?? null; };
  for (const uid of previouslyChosen) field(uid, 'st', null); // the AI result replaces the previous selection
  for (const s of parsed.selected) {
    const uid = uidOf[s.id];
    if (!uid) continue;
    order.push(uid);
    field(uid, 'st', 'chosen'); field(uid, 'hl', s.highlight || null); field(uid, 'ai', s.suggestedScore);
    field(uid, 'score', s.suggestedScore); field(uid, 'reason', s.reason || null);
  }
  for (const r of parsed.rejected) {
    const uid = uidOf[r.id];
    if (!uid || order.includes(uid)) continue;
    field(uid, 'st', 'rejected'); field(uid, 'reason', r.reason || null);
  }
  // free text: the P-ids the AI mentioned are pre-ticked for the Host to confirm
  for (const id of parsed.foundIds || []) {
    const uid = uidOf[id];
    if (!uid || order.includes(uid)) continue;
    order.push(uid);
    field(uid, 'st', 'chosen');
  }
  u[rp(code, `private/order/${roundId}`)] = order.length ? order : null;
  u[rp(code, `private/ai/${roundId}`)] = {
    at, status: parsed.status, raw: parsed.raw.slice(0, 60000),
    script: parsed.script ?? null, foundIds: parsed.foundIds.length ? parsed.foundIds : null,
    warnings: parsed.warnings.length ? parsed.warnings.slice(0, 30).map((w) => w.text) : null,
  };
  return u;
}

/** Author mapping used by the voting rule: option index per author, and in team mode for every tổ-mate too. */
export function optionOfUpdates({ code, roundId, options, players, mode }) {
  const map = {};
  options.forEach((o, i) => {
    map[o.uid] = i;
    if (mode === 'team') for (const [uid, p] of Object.entries(players || {})) if (p.team === o.team && map[uid] === undefined) map[uid] = i;
  });
  return { [rp(code, `private/optionOf/${roundId}`)]: Object.keys(map).length ? map : null };
}

/** Projection pushed to everybody: text + highlight only, never names. */
export const showcaseItemsUpdate = ({ code, items }) => ({ [rp(code, 'public/showcase/items')]: items });
export const focusUpdate = ({ code, focus }) => ({ [rp(code, 'public/showcase/focus')]: focus ?? null });

/** Hand-raise stepper. `inc` is the SDK's increment(): atomic, so two hosts tapping never lose a count (the rule refuses < 0). */
export const handUpdate = ({ code, roundId, option, delta, inc }) => ({ [rp(code, `private/hand/${roundId}/${option}`)]: inc(delta) });
export const tallyUpdate = ({ code, tally, n }) => ({ [rp(code, 'public/vote/tally')]: tally, [rp(code, 'public/vote/n')]: n });
export const clearVotesUpdates = ({ code, roundId }) => ({
  [rp(code, `votes/${roundId}`)]: null, [rp(code, `private/hand/${roundId}`)]: null,
  [rp(code, 'public/vote/tally')]: null, [rp(code, 'public/vote/n')]: 0,
});

export const scoreUpdate = ({ code, roundId, uid, score }) => ({ [rp(code, `private/review/${roundId}/${uid}/score`)]: score });

/** Award for a round (keyed by round id, so applying it twice cannot double count) + the public leaderboard. */
export const awardUpdates = ({ code, roundId, award, board }) => ({
  [rp(code, `private/awards/${roundId}`)]: award,
  [rp(code, 'public/board')]: board,
});
export const removeAwardUpdates = ({ code, roundId, board }) => ({ [rp(code, `private/awards/${roundId}`)]: null, [rp(code, 'public/board')]: board });
export const boardUpdate = ({ code, board }) => ({ [rp(code, 'public/board')]: board });
export const adjustUpdate = ({ code, key, team, delta, at, note }) => ({ [rp(code, `private/adjust/${key}`)]: { team, delta, at, ...(note ? { note } : {}) } });
export const resetPointsUpdates = ({ code }) => ({ [rp(code, 'private/awards')]: null, [rp(code, 'private/adjust')]: null, [rp(code, 'public/board')]: null });
