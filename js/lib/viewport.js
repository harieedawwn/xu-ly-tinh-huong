// Browser-only helpers: visualViewport height fallback, fullscreen, wake lock.
// Keeps the submit button visible when the Zalo toolbar or a mobile keyboard shrinks the viewport.

export function installViewport(win = window) {
  const root = win.document.documentElement;
  const vv = win.visualViewport;
  let raf = 0;
  const apply = () => {
    raf = 0;
    const h = vv ? vv.height : win.innerHeight;
    root.style.setProperty('--app-h', `${Math.round(h)}px`);
    root.style.setProperty('--app-top', `${Math.round(vv ? vv.offsetTop : 0)}px`);
  };
  const schedule = () => { if (!raf) raf = win.requestAnimationFrame(apply); };
  apply();
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', () => setTimeout(apply, 250));
  if (vv) { vv.addEventListener('resize', schedule); vv.addEventListener('scroll', schedule); }
  // iOS sometimes scrolls the layout viewport when an input is focused
  win.addEventListener('focusin', () => setTimeout(() => { win.scrollTo(0, 0); apply(); }, 50));
}

export const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

export async function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (fullscreenElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else await (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
    return true;
  } catch { return false; }
}

/** Screen Wake Lock with re-acquire on visibility change. Returns a release function. */
export async function keepAwake() {
  if (!('wakeLock' in navigator)) return () => {};
  let lock = null;
  let stopped = false;
  const acquire = async () => {
    try { lock = await navigator.wakeLock.request('screen'); } catch { lock = null; }
  };
  const onVis = () => { if (!stopped && document.visibilityState === 'visible') acquire(); };
  document.addEventListener('visibilitychange', onVis);
  await acquire();
  return () => { stopped = true; document.removeEventListener('visibilitychange', onVis); lock?.release?.().catch(() => {}); };
}
