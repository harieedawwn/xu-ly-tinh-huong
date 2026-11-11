import { useState, useEffect } from '../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Field, ErrorPanel, Spinner, ConnBadge, Tab } from '../ui.js';
import * as fb from '../fb.js';
import { useDb } from '../hooks.js';
import { rp, bankUpdate } from '../lib/room-ops.js';
import { A } from '../lib/phases.js';
import { normalizePin, isValidPin } from '../lib/roomcode.js';
import { claimHost } from '../room.js';
import { store, K } from '../lib/storage.js';
import { keepAwake } from '../lib/viewport.js';
import { normalizeBank, defaultBank } from '../lib/bank.js';
import { totals, awardFromReveal } from '../lib/scoring.js';
import { Share } from './host/share.js';
import { useHostData } from './host/data.js';
import { Controls } from './host/controls.js';
import { PlayersPanel } from './host/players.js';
import { AnswerList } from './host/answers.js';
import { ScriptReader, ensureIds } from './host/ai-panel.js';
import { BankSheet } from './host/bank.js';
import { SettingsSheet } from './host/settings.js';

/* ---------------- PIN gate (another device becomes host) ---------------- */
function PinGate({ code, uid, setClaiming }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!isValidPin(pin)) { setErr('PIN gồm đúng 6 chữ số.'); return; }
    setBusy(true); setErr(''); setClaiming(true);
    try {
      const r = await claimHost(uid, code, pin);
      if (!r.ok) setErr(r.reason === 'exhausted' ? 'Thiết bị này đã thử sai quá 8 lần. Dùng thiết bị khác.' : r.reason === 'noroom' ? 'Phòng không còn tồn tại.' : `PIN chưa đúng. Còn ${r.left} lần thử.`);
    } catch (e2) { setErr(fb.describeError(e2).text); } finally { setBusy(false); setClaiming(false); }
  };
  return html`<main class="host scroll"><form class="card stack" onSubmit=${submit}>
    <div class="row spread"><span class="brand">Host · phòng <${Tab} text=${code} class="wide" /></span><${ConnBadge} /></div>
    <h2>Nhập PIN Host</h2>
    <${Field} label="PIN 6 số" error=${err}>
      <input class="input input--pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxLength="6" value=${pin} autofocus
        onInput=${(e) => { setPin(normalizePin(e.target.value)); setErr(''); }} />
    <//>
    <${Btn} kind="primary" big type="submit" disabled=${busy || pin.length < 6} icon="key">Vào bảng Host<//>
    <a class="btn" href="#/">Về trang chủ</a>
  </form></main>`;
}

/* ---------------- board ---------------- */
function sortKeys(v) {
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
}
const sameBoard = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const normBoard = (b) => ({ t: b?.t || {}, p: b?.p || {} });

/** True on a laptop-width screen, where the three columns are all visible at once. */
function useWide() {
  const q = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1000px)') : null;
  const [wide, setWide] = useState(!!q?.matches);
  useEffect(() => {
    if (!q) return undefined;
    const on = () => setWide(q.matches);
    q.addEventListener?.('change', on);
    return () => q.removeEventListener?.('change', on);
  }, []);
  return wide;
}

function HostBoard({ code, uid, pub }) {
  const ctx = useHostData(code, pub);
  const { settings, players, reps, submitted, step, write, actions } = ctx;
  const [tab, setTab] = useState('control');
  const [sheet, setSheet] = useState(null); // 'bank' | 'settings' | 'script'
  const wide = useWide();

  useEffect(() => {
    const off = fb.holdPresence(rp(code, `presence/${uid}`));
    return () => { try { off(); } catch { /* */ } };
  }, [code, uid]);

  useEffect(() => {
    if (store.get(K.hostWake, '0') !== '1') return undefined;
    let rel = () => {};
    keepAwake().then((r) => { rel = r; });
    return () => rel();
  }, []);

  // auto-lock once time AND the grace period are over (rules already refuse late answers). Quiet: a second Host may win the race.
  useEffect(() => {
    if (pub.phase !== 'answering' || pub.timer?.state !== 'running') return undefined;
    const wait = pub.timer.endsAt + (settings.graceMs ?? 3000) - fb.serverNow() + 150;
    const id = setTimeout(() => { step(A.LOCK, {}, { quiet: true }); }, Math.max(0, wait));
    return () => clearTimeout(id);
  }, [pub.phase, pub.timer?.state, pub.timer?.endsAt, pub.roundId]);

  // stable short ids (P01..) as soon as answers are locked
  const answerKeys = Object.keys(ctx.answers).join(',');
  useEffect(() => {
    if (!ctx.round || !['locked', 'reviewing'].includes(pub.phase) || !answerKeys) return;
    ensureIds(ctx).catch(() => {});
  }, [pub.phase, ctx.round, answerKeys, Object.keys(players).length]);

  // seed the question bank: this device's copy, else the 6 built-in situations
  useEffect(() => {
    if (!ctx.bankLoaded || ctx.bank.length) return;
    const local = normalizeBank(store.getJSON(K.bank, null));
    write(bankUpdate({ code, bank: local.length ? local : defaultBank() }));
  }, [ctx.bankLoaded, ctx.bank.length]);

  // live tally + number of phone votes for the TV (the Host is the only one allowed to read votes)
  useEffect(() => {
    if (!['voting', 'scoring'].includes(pub.phase) || !pub.vote) return undefined;
    const want = settings.liveTally ? ctx.counts : null;
    const same = JSON.stringify(Object.values(pub.vote.tally || {})) === JSON.stringify(want || []) && (pub.vote.n || 0) === ctx.voted;
    if (same) return undefined;
    const id = setTimeout(() => { write({ [rp(code, 'public/vote/tally')]: want, [rp(code, 'public/vote/n')]: ctx.voted }); }, 700);
    return () => clearTimeout(id);
  }, [pub.phase, JSON.stringify(ctx.counts), ctx.voted, settings.liveTally, JSON.stringify(pub.vote?.tally || null), pub.vote?.n]);

  // keep the public leaderboard equal to what the awards and adjustments say (also heals a crash between the two writes of a reveal)
  useEffect(() => {
    if (!ctx.awardsLoaded) return undefined;
    const id = setTimeout(() => {
      const c = ctx.ref.current;
      const rv = c.pub.reveal;
      if (rv && rv.roundId === c.round && !c.awards[c.round] && ['reveal', 'leaderboard'].includes(c.pub.phase)) {
        // the reveal landed but its award did not: rebuild the award from the reveal itself
        const texts = Object.fromEntries(Object.entries(c.answers).map(([u, a]) => [u, a.text]));
        write({ [rp(code, `private/awards/${c.round}`)]: awardFromReveal({ reveal: rv, texts, settings: c.settings, roundId: c.round, at: fb.serverNow(), question: c.pub.question?.title || '' }) });
        return;
      }
      const want = totals(c.awards, c.adjust);
      if (!sameBoard(normBoard(c.pub.board), want)) actions.syncBoard(want);
    }, 900);
    return () => clearTimeout(id);
  }, [ctx.awardsLoaded, JSON.stringify(ctx.awards), JSON.stringify(ctx.adjust), JSON.stringify(pub.board || null), pub.reveal?.roundId, pub.phase]);

  const joined = Object.keys(players);
  const isTeam = settings.mode === 'team';
  const teamsWith = [...new Set(joined.map((u) => players[u].team))];
  const submittedCount = isTeam ? teamsWith.filter((t) => reps[t] && submitted[reps[t]]).length : joined.filter((u) => submitted[u]).length;
  const expected = isTeam ? teamsWith.length : joined.length;

  const tabs = [['control', 'Điều khiển'], ['players', 'Người chơi'], ['answers', 'Bài nộp']];
  return html`<div class="host">
    <header class="host__bar">
      <div class="row row--nowrap host__id"><span class="brand">Host</span><span class="chip"><${Tab} text=${code} class="wide" /></span></div>
      <div class="row row--nowrap">
        <${Btn} small class="btn--icon" aria-label="Ngân hàng câu hỏi" icon="book" onClick=${() => setSheet('bank')} />
        <${Btn} small class="btn--icon" aria-label="Cài đặt" icon="settings" onClick=${() => setSheet('settings')} />
        <${ConnBadge} />
      </div>
    </header>
    <nav class="host__tabs seg" aria-label="Mục">${tabs.map(([k, t]) => html`<button key=${k} aria-pressed=${tab === k} onClick=${() => setTab(k)}>${t}</button>`)}</nav>
    <main class="host__main scroll">
      <div class="host__grid">
        <div class="host__col" data-active=${tab === 'control'}>
          ${pub.phase === 'lobby' ? html`<${Share} code=${code} />` : null}
          <${Controls} ctx=${ctx} joined=${joined.length} submittedCount=${submittedCount} expected=${expected} onOpenBank=${() => setSheet('bank')} onOpenScript=${() => setSheet('script')} embedAnswers=${!wide && tab === 'control'} wide=${wide} />
        </div>
        <div class="host__col" data-active=${tab === 'players'}><${PlayersPanel} ctx=${ctx} /></div>
        <div class="host__col" data-active=${tab === 'answers'}>${tab === 'answers' || wide ? html`<${AnswerList} ctx=${ctx} selectable=${pub.phase === 'reviewing'} />` : null}</div>
      </div>
    </main>
    ${sheet === 'bank' ? html`<${BankSheet} ctx=${ctx} onClose=${() => setSheet(null)} />` : null}
    ${sheet === 'settings' ? html`<${SettingsSheet} ctx=${ctx} onClose=${() => setSheet(null)} />` : null}
    ${sheet === 'script' ? html`<${ScriptReader} ctx=${ctx} onClose=${() => setSheet(null)} />` : null}
  </div>`;
}

export function HostScreen({ code, uid }) {
  const pubQ = useDb(`rooms/${code}/public`);
  const hostQ = useDb(`rooms/${code}/hostUids/${uid}`);
  // While a claim is in flight the SDK shows our own optimistic hostUids write; keep the gate up until the server answers.
  const [claiming, setClaiming] = useState(false);
  if (pubQ.error || hostQ.error) return html`<main class="host scroll"><${ErrorPanel} text=${fb.describeError(pubQ.error || hostQ.error).text} onRetry=${() => location.reload()} /></main>`;
  if (!pubQ.loaded || !hostQ.loaded) return html`<div class="center"><${Spinner} /></div>`;
  if (pubQ.value == null) return html`<main class="host scroll"><div class="card stack"><h2>Không tìm thấy phòng</h2><p>Phòng ${code} không tồn tại hoặc đã bị xoá.</p><a class="btn btn--primary" href="#/">Về trang chủ</a></div></main>`;
  if (hostQ.value !== true || claiming) return html`<${PinGate} code=${code} uid=${uid} setClaiming=${setClaiming} />`;
  return html`<${HostBoard} code=${code} uid=${uid} pub=${pubQ.value} />`;
}
