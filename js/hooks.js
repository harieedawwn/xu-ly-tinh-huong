import { useState, useEffect, useRef, useCallback } from '../vendor/preact-hooks.mjs';
import * as fb from './fb.js';
import { remainingMs, displaySeconds } from './lib/timer.js';

/** Subscribe to a database path. `path` may be falsy to disable. */
export function useDb(path) {
  const [st, setSt] = useState({ value: undefined, loaded: false, error: null });
  useEffect(() => {
    if (!path) { setSt({ value: undefined, loaded: false, error: null }); return undefined; }
    setSt((s) => (s.loaded ? { value: undefined, loaded: false, error: null } : s));
    let off = () => {};
    try {
      off = fb.listen(path, (value) => setSt({ value, loaded: true, error: null }), (error) => setSt({ value: undefined, loaded: true, error }));
    } catch (error) { setSt({ value: undefined, loaded: true, error }); }
    return () => { try { off(); } catch { /* ignore */ } };
  }, [path]);
  return st;
}

export function useConnected() {
  const [on, setOn] = useState(true);
  const [since, setSince] = useState(0); // ms the connection has been down
  useEffect(() => {
    let off = () => {};
    try { off = fb.onConnected(setOn); } catch { /* sdk not ready */ }
    return () => { try { off(); } catch { /* */ } };
  }, []);
  useEffect(() => {
    if (on) { setSince(0); return undefined; }
    const t0 = Date.now();
    const id = setInterval(() => setSince(Date.now() - t0), 1000);
    return () => clearInterval(id);
  }, [on]);
  return { connected: on, downMs: since };
}

/** Re-render every `ms`. */
export function useTick(ms = 1000) {
  const [, setN] = useState(0);
  useEffect(() => { const id = setInterval(() => setN((n) => n + 1), ms); return () => clearInterval(id); }, [ms]);
}

/** Remaining ms of a timer node, synced to server time; updates ~10x/s but only re-renders when the shown second changes. */
export function useCountdown(timer) {
  const compute = () => remainingMs(timer, fb.serverNow());
  const [ms, setMs] = useState(compute);
  const last = useRef(-1);
  useEffect(() => {
    last.current = -1;
    const tick = () => {
      const v = compute();
      const s = displaySeconds(v);
      if (s !== last.current || timer?.state !== 'running') { last.current = s; setMs(v); }
    };
    tick();
    if (timer?.state !== 'running') return undefined;
    const id = setInterval(tick, 100);
    const un = fb.onOffset(tick);
    return () => { clearInterval(id); un(); };
  }, [timer?.state, timer?.endsAt, timer?.remainingMs, timer?.durationMs]);
  return ms;
}

/** Run an async action with pending/error state (disables double taps). */
export function useAction(fn) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async (...args) => {
    setPending(true); setError(null);
    try { return await fn(...args); }
    catch (e) { setError(e); return undefined; }
    finally { setPending(false); }
  }, [fn]);
  return { run, pending, error, clearError: () => setError(null) };
}

export function useHashRoute(parse) {
  const [r, setR] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => setR(parse(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
