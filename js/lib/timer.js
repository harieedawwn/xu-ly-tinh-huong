// Timer math. All instants are SERVER milliseconds; clients convert with the
// .info/serverTimeOffset value (serverNow = Date.now() + offset).
//
// timer node shape (stored at /rooms/{code}/public/timer):
//   { state: 'idle' | 'running' | 'paused', durationMs, endsAt?, remainingMs? }
//   running -> endsAt is set; paused -> remainingMs is set.

export const DEFAULT_GRACE_MS = 3000;
export const PRESETS_S = [60, 90, 120, 180];

export const serverNow = (offsetMs = 0, clock = Date.now) => clock() + offsetMs;

export function startTimer(durationMs, nowServer) {
  const d = Math.max(0, Math.round(durationMs));
  return { state: 'running', durationMs: d, endsAt: nowServer + d };
}

export function idleTimer(durationMs = 0) {
  return { state: 'idle', durationMs: Math.max(0, Math.round(durationMs)) };
}

export function remainingMs(timer, nowServer) {
  if (!timer) return 0;
  if (timer.state === 'running') return Math.max(0, timer.endsAt - nowServer);
  if (timer.state === 'paused') return Math.max(0, timer.remainingMs ?? 0);
  return Math.max(0, timer.durationMs ?? 0);
}

export function pauseTimer(timer, nowServer) {
  if (!timer || timer.state !== 'running') return timer;
  return { state: 'paused', durationMs: timer.durationMs, remainingMs: remainingMs(timer, nowServer) };
}

export function resumeTimer(timer, nowServer) {
  if (!timer || timer.state !== 'paused') return timer;
  return { state: 'running', durationMs: timer.durationMs, endsAt: nowServer + (timer.remainingMs ?? 0) };
}

/** Add time while running or paused. */
export function extendTimer(timer, addMs, nowServer) {
  if (!timer) return timer;
  if (timer.state === 'running') {
    return { state: 'running', durationMs: timer.durationMs + addMs, endsAt: Math.max(timer.endsAt, nowServer) + addMs };
  }
  if (timer.state === 'paused') {
    return { state: 'paused', durationMs: timer.durationMs + addMs, remainingMs: (timer.remainingMs ?? 0) + addMs };
  }
  return timer;
}

/** Whole seconds shown on screen: rounds up so "0" only appears at zero. */
export function displaySeconds(ms) {
  return Math.max(0, Math.ceil(ms / 1000));
}

export function formatClock(ms) {
  const s = displaySeconds(ms);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

/**
 * Mirrors the database rule for answer writes:
 *   (state == 'running' && now <= endsAt + graceMs) || state == 'paused'
 */
export function isSubmitWindowOpen(timer, graceMs, nowServer) {
  if (!timer) return false;
  if (timer.state === 'paused') return true;
  if (timer.state !== 'running') return false;
  return nowServer <= timer.endsAt + graceMs;
}

export function isExpired(timer, nowServer) {
  return !!timer && timer.state === 'running' && nowServer >= timer.endsAt;
}

/** Parse a custom duration typed by the host ("90", "1:30"); returns ms or null. */
export function parseDuration(input) {
  const s = String(input ?? '').trim();
  let sec;
  if (/^\d{1,2}:\d{1,2}$/.test(s)) {
    const [m, r] = s.split(':').map(Number);
    if (r > 59) return null;
    sec = m * 60 + r;
  } else if (/^\d{1,4}$/.test(s)) {
    sec = Number(s);
  } else return null;
  if (sec < 10 || sec > 3600) return null;
  return sec * 1000;
}
