// Pure builders for every database write the app performs. No Firebase imports: the server-timestamp
// sentinel is passed in, so the SAME payloads are exercised by tools/rules-test.mjs against the real rules.
import { defaultTeams } from './teams.js';
import { startTimer, extendTimer, pauseTimer, resumeTimer, idleTimer } from './timer.js';

export const rp = (code, path = '') => `rooms/${code}${path ? '/' + path : ''}`;

export const DEFAULT_SETTINGS = Object.freeze({
  mode: 'all', // 'all' = Cả lớp, 'team' = Đại diện tổ
  minChars: 20,
  maxChars: 800,
  graceMs: 3000,
  allowEdit: true,
  autoSubmit: true,
  lockJoin: false,
});

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
