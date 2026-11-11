import { useState, useEffect, useRef, useMemo } from '../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Spinner, ConnBadge, CodeCells, Clock, QR, Tab, ErrorPanel } from '../ui.js';
import * as fb from '../fb.js';
import { useDb, useCountdown } from '../hooks.js';
import { teamList } from '../lib/teams.js';
import { routeUrl, shortUrl } from '../lib/route.js';
import { store, K } from '../lib/storage.js';
import { toggleFullscreen, fullscreenElement, keepAwake } from '../lib/viewport.js';
import { canFullscreen } from '../lib/device.js';
import { withDefaults } from '../lib/settings.js';
import { displaySeconds } from '../lib/timer.js';
import { FitText, TvShowcase, TvVoting, TvReveal, TvLeaderboard } from './tv-views.js';

const SIZES = { S: 0.85, M: 1, L: 1.15, XL: 1.3 };

/** Short tick every second during the last 10 s. Browsers only allow sound after a touch, so the first tap/click on the TV arms it. */
function useBeeps(on, secondsLeft) {
  const ctxRef = useRef(null);
  useEffect(() => {
    const arm = () => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctxRef.current ||= new AC();
        ctxRef.current.resume?.();
      } catch { /* no audio */ }
    };
    window.addEventListener('pointerdown', arm, { passive: true });
    window.addEventListener('keydown', arm);
    return () => { window.removeEventListener('pointerdown', arm); window.removeEventListener('keydown', arm); };
  }, []);
  useEffect(() => {
    const ac = ctxRef.current;
    if (!on || !ac || ac.state !== 'running' || secondsLeft < 1 || secondsLeft > 10) return;
    try {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = secondsLeft <= 3 ? 880 : 660;
      g.gain.setValueAtTime(0.0001, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.2);
    } catch { /* ignore */ }
  }, [on, secondsLeft]);
}

function useIdle(ms) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let id;
    const wake = () => { setIdle(false); clearTimeout(id); id = setTimeout(() => setIdle(true), ms); };
    wake();
    ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => { clearTimeout(id); ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, wake)); };
  }, [ms]);
  return idle;
}

function Tools({ theme, setTheme, size, setSize, idle }) {
  const [fs, setFs] = useState(!!fullscreenElement());
  return html`<div class=${`tv__tools ${idle ? 'is-idle' : ''}`}>
    <${Btn} small class="btn--icon" aria-label=${theme === 'dark' ? 'Nền sáng' : 'Nền tối'} icon=${theme === 'dark' ? 'sun' : 'moon'} onClick=${() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
    <div class="seg" role="group" aria-label="Cỡ chữ">${Object.keys(SIZES).map((k) => html`<button key=${k} aria-pressed=${size === k} onClick=${() => setSize(k)}>${k}</button>`)}</div>
    ${canFullscreen(document) ? html`<${Btn} small class="btn--icon" aria-label="Toàn màn hình" icon=${fs ? 'minimize' : 'maximize'} onClick=${async () => { await toggleFullscreen(); setFs(!!fullscreenElement()); }} />` : null}
  </div>`;
}

function PlayersByTeam({ teams, players, presence, submitted, showSubmitted }) {
  const list = teamList(teams);
  const byTeam = useMemo(() => {
    const m = {};
    Object.entries(players || {}).forEach(([uid, p]) => { (m[p.team] ||= []).push({ uid, ...p }); });
    Object.values(m).forEach((a) => a.sort((x, y) => (x.joinedAt || 0) - (y.joinedAt || 0)));
    return m;
  }, [players]);
  const rows = Math.max(4, ...Object.values(byTeam).map((a) => a.length));
  return html`<div class="tv__teams" style=${{ '--rows': rows, '--cols': rows > 8 ? 2 : 1 }}>${list.map((t) => {
    const ps = byTeam[t.id] || [];
    return html`<section key=${t.id} class="tvteam">
      <header class=${`tvteam__head team team--${t.id}`}><span>${t.name}</span><span><${Tab} text=${String(ps.length)} /></span></header>
      <ul class="tvteam__list">${ps.map((p) => html`<li key=${p.uid} class=${presence?.[p.uid] ? '' : 'is-off'}>${showSubmitted && submitted?.[p.uid] ? html`<${Icon} name="check" />` : null}<span>${p.name}</span></li>`)}</ul>
    </section>`;
  })}</div>`;
}

export function TvScreen({ code }) {
  const pubQ = useDb(`rooms/${code}/public`);
  const playersQ = useDb(`rooms/${code}/players`);
  const presenceQ = useDb(`rooms/${code}/presence`);
  const repsQ = useDb(`rooms/${code}/reps`);
  const pub = pubQ.value;
  const roundId = pub?.roundId;
  const subQ = useDb(roundId && roundId !== 'r0' ? `rooms/${code}/submitted/${roundId}` : null);
  const ms = useCountdown(pub?.timer);
  const hostSettings = withDefaults(pub?.settings);
  const [theme, setThemeS] = useState(store.get(K.tvTheme, null) || 'light');
  const [size, setSizeS] = useState(store.get(K.tvSize, null) || 'M');
  // the Host's TV settings win whenever they change (and on first load); the buttons on the TV still work locally
  const seenHost = useRef(null);
  useEffect(() => {
    if (!pub) return;
    const key = `${hostSettings.tvTheme}|${hostSettings.tvSize}`;
    if (seenHost.current === key) return;
    const first = seenHost.current === null;
    seenHost.current = key;
    if (first && (store.get(K.tvTheme, null) || store.get(K.tvSize, null))) return; // a TV that was set up by hand keeps its choice until the Host changes something
    setThemeS(hostSettings.tvTheme); setSizeS(hostSettings.tvSize);
  }, [pub, hostSettings.tvTheme, hostSettings.tvSize]);
  const idle = useIdle(5000);
  const setTheme = (t) => { setThemeS(t); store.set(K.tvTheme, t); };
  const setSize = (s) => { setSizeS(s); store.set(K.tvSize, s); };

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); return () => document.documentElement.removeAttribute('data-theme'); }, [theme]);
  useEffect(() => { let rel = () => {}; keepAwake().then((r) => { rel = r; }); return () => rel(); }, []);

  const players = playersQ.value || {};
  const settings = hostSettings;
  const joinUrl = routeUrl('play', code);
  const scale = SIZES[size] || 1;
  const style = { '--tv-scale': scale };

  useBeeps(settings.tvSound && pub?.phase === 'answering' && pub?.timer?.state === 'running', displaySeconds(ms));

  if (pubQ.error) return html`<main class="tv tv--center" style=${style}><${ErrorPanel} text=${fb.describeError(pubQ.error).text} onRetry=${() => location.reload()} /></main>`;
  if (!pubQ.loaded) return html`<main class="tv tv--center" style=${style}><${Spinner} /></main>`;
  if (pub == null) return html`<main class="tv tv--center" style=${style}><div class="tv__msg"><h1>Không tìm thấy phòng ${code}</h1><p class="key">Kiểm tra lại mã phòng.</p></div></main>`;

  const phase = pub.phase;
  const teams = settings.teams;
  const joined = Object.keys(players);
  const submittedUids = Object.keys(subQ.value || {}).filter((u) => players[u]);
  const isTeam = settings.mode === 'team';
  const teamIds = teamList(teams).map((t) => t.id).filter((id) => joined.some((u) => players[u].team === id));
  const expected = isTeam ? teamIds.length : joined.length;
  const submittedCount = isTeam ? teamIds.filter((id) => repsQ.value?.[id] && subQ.value?.[repsQ.value[id]]).length : submittedUids.length;

  const inRound = phase !== 'lobby';
  const top = html`<header class="tv__top">
    <span class="tv__brand">Xử lý tình huống</span>
    ${inRound ? html`<span class="tv__ttl">${pub.question?.title}</span>` : html`<span></span>`}
    <div class="tv__topr"><${Tools} theme=${theme} setTheme=${setTheme} size=${size} setSize=${setSize} idle=${idle} /><${ConnBadge} /></div>
  </header>`;

  let main;
  if (phase === 'lobby') {
    main = html`<div class="tv__lobby">
      <div class="tv__left">
        <p class="key">Vào phòng bằng mã</p>
        <div class="tv__code"><${CodeCells} code=${code} /></div>
        <div class="tv__joinrow">
          <div class="tv__qr"><${QR} text=${joinUrl} label="Mã QR vào phòng" /></div>
          <div class="tv__how"><p class="key">hoặc quét mã QR</p><p class="tv__url">${shortUrl('play', code)}</p></div>
        </div>
      </div>
      <div class="tv__roster">
        <p class="key">Trong phòng: <${Tab} text=${String(joined.length)} /> bạn</p>
        <${PlayersByTeam} teams=${teams} players=${players} presence=${presenceQ.value} />
      </div>
    </div>`;
  } else if (phase === 'answering' || phase === 'locked') {
    const locked = phase === 'locked';
    main = html`<div class="tv__round">
      <div class="tv__status">
        <div class=${`tv__timer ${!locked && ms <= 10_000 && pub.timer?.state === 'running' ? 'is-hot' : ''}`}>${locked ? html`<span>Hết giờ</span>` : html`<${Clock} ms=${ms} />`}${pub.timer?.state === 'paused' ? html`<span class="tv__paused">tạm dừng</span>` : null}</div>
        <div class="tv__count"><span class="key">Đã nộp</span><span class="tv__num"><${Tab} text=${`${submittedCount}/${expected}`} /></span></div>
        ${settings.tvQr ? html`<div class="tv__corner"><${QR} text=${joinUrl} label="Mã QR vào phòng" /><span class="tv__codesm"><${Tab} text=${code} class="wide" /></span></div>` : html`<div class="tv__corner"><span class="tv__codesm"><${Tab} text=${code} class="wide" /></span></div>`}
        ${isTeam ? html`<div class="tv__teamstate">${teamList(teams).filter((t) => teamIds.includes(t.id)).map((t) => {
          const done = repsQ.value?.[t.id] && subQ.value?.[repsQ.value[t.id]];
          return html`<span key=${t.id} class=${`chip team team--${t.id}`}>${done ? html`<${Icon} name="check" />` : null}${t.name}</span>`;
        })}</div>` : null}
      </div>
      <${FitText} text=${pub.question?.text} class="tv__question" maxVh=${7 * scale} />
    </div>`;
  } else if (phase === 'reviewing') {
    main = html`<div class="tv__msg"><h1>Đang chấm</h1><p class="key">Host đang xem các bài nộp.</p><p class="tv__sub">Đã nộp <${Tab} text=${`${submittedCount}/${expected}`} /></p></div>`;
  } else if (phase === 'showcase') {
    main = html`<${TvShowcase} pub=${pub} scale=${scale} />`;
  } else if (phase === 'voting') {
    main = html`<${TvVoting} pub=${pub} scale=${scale} total=${joined.length} />`;
  } else if (phase === 'scoring') {
    main = html`<div class="tv__msg"><h1>Đang tính điểm</h1><p class="key">Chuẩn bị công bố người thắng.</p></div>`;
  } else if (phase === 'reveal') {
    main = html`<${TvReveal} pub=${pub} scale=${scale} teams=${teams} />`;
  } else if (phase === 'leaderboard') {
    main = html`<${TvLeaderboard} pub=${pub} scale=${scale} teams=${teams} players=${players} />`;
  } else {
    main = html`<div class="tv__msg"><h1>Đang chấm</h1></div>`;
  }

  return html`<main class="tv" style=${style}>${top}${main}</main>`;
}
