import { useState, useEffect, useMemo } from '../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Field, ErrorPanel, Spinner, ConnBadge, TeamChip, Clock, QR, Tab, toast, confirmDialog, copyText } from '../ui.js';
import * as fb from '../fb.js';
import { useDb, useCountdown, useAction } from '../hooks.js';
import { SCENARIOS } from '../data/scenarios.js';
import {
  rp, startRoundUpdates, lockUpdates, reopenUpdates, backToLobbyUpdates, extendTimerUpdate, pauseTimerUpdate, resumeTimerUpdate, kickUpdates, endRoomUpdates,
} from '../lib/room-ops.js';
import { teamList } from '../lib/teams.js';
import { PRESETS_S, parseDuration } from '../lib/timer.js';
import { routeUrl, routeHash } from '../lib/route.js';
import { normalizePin, isValidPin } from '../lib/roomcode.js';
import { claimHost, forgetHostRoom } from '../room.js';
import { store, K } from '../lib/storage.js';

const PHASE_LABEL = {
  lobby: 'Sảnh chờ', answering: 'Đang nộp bài', locked: 'Đã khoá bài', reviewing: 'Đang chấm', showcase: 'Trình chiếu',
  voting: 'Bình chọn', scoring: 'Chấm điểm', reveal: 'Công bố', leaderboard: 'Bảng điểm',
};

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

/* ---------------- share block ---------------- */
function Share({ code }) {
  const [open, setOpen] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const url = routeUrl('play', code);
  const pin = store.get(K.pin(code));
  const copy = async (text, msg) => { toast((await copyText(text)) ? msg : 'Không sao chép được. Hãy chọn và sao chép thủ công.'); };
  return html`<section class="card stack">
    <div class="row spread"><h3>Mời lớp vào phòng</h3><${Btn} small class="btn--icon" aria-label=${open ? 'Thu gọn' : 'Mở rộng'} icon=${open ? 'down' : 'qr'} onClick=${() => setOpen(!open)} /></div>
    <div class="row"><${Tab} text=${code} class="wide share__code" /></div>
    <div class="row">
      <${Btn} small icon="copy" onClick=${() => copy(url, 'Đã sao chép liên kết')}>Sao chép liên kết<//>
      <a class="btn btn--small" href=${routeHash('tv', code)} target="_blank" rel="noopener"><${Icon} name="tv" />Mở màn hình TV</a>
    </div>
    ${open ? html`<div class="row" style="align-items:flex-start"><${QR} text=${url} style="width:168px" />
      <div class="stack-s grow"><span class="help">${url.replace(/^https?:\/\//, '')}</span>
        <div class="row row--nowrap"><span class="label">PIN</span>${pin ? html`<span class="strong"><${Tab} text=${showPin ? pin : '••••••'} /></span><${Btn} small class="btn--icon" aria-label=${showPin ? 'Ẩn PIN' : 'Hiện PIN'} icon=${showPin ? 'eye-off' : 'eye'} onClick=${() => setShowPin(!showPin)} />` : html`<span class="help">Không lưu trên thiết bị này</span>`}</div>
      </div></div>` : null}
  </section>`;
}

/* ---------------- controls tab ---------------- */
function QuestionPicker({ selected, setSelected, secs, setSecs, customSecs, setCustomSecs }) {
  const sc = SCENARIOS.find((s) => s.id === selected);
  return html`<div class="stack">
    <div class="stack-s"><span class="label">Tình huống</span>
      <div class="qpick" role="radiogroup" aria-label="Chọn tình huống">${SCENARIOS.map((s, i) => html`<button key=${s.id} type="button" role="radio" aria-checked=${selected === s.id} class="qpick__item" onClick=${() => { setSelected(s.id); setSecs(s.time); setCustomSecs(''); }}>
        <span class="qpick__n"><${Tab} text=${String(i + 1)} /></span><span>${s.title}</span></button>`)}</div>
      <details class="preview"><summary>Xem nội dung</summary><p class="qtext">${sc.text}</p>
        <ul class="criteria">${sc.criteria.map((c, i) => html`<li key=${i}>${c}</li>`)}</ul></details>
    </div>
    <div class="stack-s"><span class="label">Thời gian</span>
      <div class="seg" role="group" aria-label="Thời gian làm bài">
        ${PRESETS_S.map((s) => html`<button key=${s} aria-pressed=${!customSecs && secs === s} onClick=${() => { setSecs(s); setCustomSecs(''); }}>${s}s</button>`)}
        <button aria-pressed=${!!customSecs} onClick=${() => setCustomSecs(customSecs || String(secs))}>Khác</button>
      </div>
      ${customSecs !== '' ? html`<input class="input" inputmode="numeric" aria-label="Số giây" placeholder="Số giây, ví dụ 150" value=${customSecs} onInput=${(e) => setCustomSecs(e.target.value.replace(/[^\d:]/g, ''))} />` : null}
    </div>
  </div>`;
}

function Toggle({ label, help, on, onChange }) {
  return html`<button type="button" class="toggle" role="switch" aria-checked=${on} onClick=${() => onChange(!on)}>
    <span class="grow" style="text-align:left"><span class="strong">${label}</span>${help ? html`<span class="help" style="display:block">${help}</span>` : null}</span>
    <span class=${`toggle__box ${on ? 'is-on' : ''}`} aria-hidden="true">${on ? html`<${Icon} name="check" />` : null}</span></button>`;
}

function Controls({ code, pub, joined, submittedCount, expected }) {
  const settings = pub.settings;
  const ms = useCountdown(pub.timer);
  const [selected, setSelected] = useState(pub.question?.id || SCENARIOS[0].id);
  const [secs, setSecs] = useState(SCENARIOS.find((s) => s.id === (pub.question?.id || SCENARIOS[0].id))?.time || 120);
  const [customSecs, setCustomSecs] = useState('');
  const setSetting = (k, v) => fb.set(rp(code, `public/settings/${k}`), v).catch((e) => toast(fb.describeError(e).text, 'error'));

  const durationMs = customSecs !== '' ? parseDuration(customSecs) : secs * 1000;
  const startA = useAction(async () => {
    const sc = SCENARIOS.find((s) => s.id === selected);
    if (!durationMs) { toast('Thời gian từ 10 giây đến 60 phút.', 'error'); return; }
    const { updates } = startRoundUpdates({ code, roundNo: pub.roundNo || 0, question: sc, durationMs, nowServer: fb.serverNow() });
    await fb.update(updates);
  });
  const act = useAction(async (updates) => { await fb.update(updates); });
  const phase = pub.phase;
  const running = pub.timer?.state === 'running';
  const paused = pub.timer?.state === 'paused';
  const failed = startA.error || act.error;

  const endRoom = async () => {
    const ok = await confirmDialog({ title: 'Kết thúc và xoá phòng?', body: 'Toàn bộ bài nộp và dữ liệu của phòng sẽ bị xoá, không khôi phục được.', confirmLabel: 'Xoá phòng', danger: true });
    if (!ok) return;
    try { await fb.update(endRoomUpdates({ code })); forgetHostRoom(code); location.hash = '#/'; }
    catch (e) { toast(fb.describeError(e).text, 'error'); }
  };

  const main = phase === 'lobby'
    ? html`<${Btn} kind="primary" big icon="play" disabled=${startA.pending || !durationMs || joined === 0} onClick=${() => startA.run()}>Bắt đầu câu hỏi<//>`
    : phase === 'answering'
      ? html`<${Btn} kind="primary" big icon="lock" disabled=${act.pending} onClick=${() => act.run(lockUpdates({ code }))}>Khoá bài<//>`
      : html`<div class="stack-s"><${Btn} kind="primary" big icon="arrow-right" disabled=${act.pending} onClick=${() => act.run(backToLobbyUpdates({ code }))}>Câu tiếp theo<//>
          <${Btn} block icon="undo" disabled=${act.pending} onClick=${() => act.run(reopenUpdates({ code, durationMs: 60_000, nowServer: fb.serverNow() }))}>Mở lại nộp bài thêm 60 giây<//></div>`;

  return html`<div class="stack">
    ${phase !== 'lobby' ? html`<section class="card stack">
      <div class="row spread"><span class="label">${PHASE_LABEL[phase] || phase}</span><span class="help">${pub.question?.title}</span></div>
      ${phase === 'answering' ? html`<div class="bigtimer ${ms <= 10_000 && running ? 'is-hot' : ''}"><${Clock} ms=${ms} />${paused ? html`<span class="xs"> tạm dừng</span>` : null}</div>
        <div class="progress" aria-hidden="true"><i style=${{ width: `${pub.timer?.durationMs ? Math.min(100, ((pub.timer.durationMs - ms) / pub.timer.durationMs) * 100) : 0}%` }}></i></div>` : html`<div class="bigtimer">Hết giờ</div>`}
      <div class="kv"><span>Đã nộp</span><span class="strong"><${Tab} text=${`${submittedCount}/${expected}`} /></span></div>
      ${phase === 'answering' ? html`<div class="row row--nowrap">
        <${Btn} small class="grow" icon="plus" disabled=${act.pending} onClick=${() => act.run(extendTimerUpdate({ code, timer: pub.timer, addMs: 30_000, nowServer: fb.serverNow() }))}>30 giây<//>
        ${paused ? html`<${Btn} small class="grow" icon="play" disabled=${act.pending} onClick=${() => act.run(resumeTimerUpdate({ code, timer: pub.timer, nowServer: fb.serverNow() }))}>Tiếp tục<//>`
          : html`<${Btn} small class="grow" icon="pause" disabled=${act.pending || !running} onClick=${() => act.run(pauseTimerUpdate({ code, timer: pub.timer, nowServer: fb.serverNow() }))}>Tạm dừng<//>`}
      </div>` : null}
    </section>` : null}

    ${phase === 'lobby' ? html`<section class="card stack"><${QuestionPicker} selected=${selected} setSelected=${setSelected} secs=${secs} setSecs=${setSecs} customSecs=${customSecs} setCustomSecs=${setCustomSecs} /></section>` : null}

    <section class="card stack">
      <h3>Cách nộp bài</h3>
      <div class="seg" role="group" aria-label="Cách nộp bài">
        <button aria-pressed=${settings.mode !== 'team'} onClick=${() => setSetting('mode', 'all')}>Cả lớp</button>
        <button aria-pressed=${settings.mode === 'team'} onClick=${() => setSetting('mode', 'team')}>Đại diện tổ</button>
      </div>
      <${Toggle} label="Cho sửa bài đến khi khoá" on=${settings.allowEdit !== false} onChange=${(v) => setSetting('allowEdit', v)} />
      <${Toggle} label="Khoá phòng, không cho vào thêm" on=${settings.lockJoin === true} onChange=${(v) => setSetting('lockJoin', v)} />
    </section>

    ${failed ? html`<${ErrorPanel} text=${fb.describeError(failed).text} />` : null}
    <div class="stack-s"><${Btn} class="btn--danger" icon="trash" onClick=${endRoom}>Kết thúc và xoá phòng<//></div>
    <div class="host__dock" data-slot="main">${main}</div>
  </div>`;
}

/* ---------------- players tab ---------------- */
function PlayersPanel({ code, pub, players, presence, reps, submitted }) {
  const teams = teamList(pub.settings.teams);
  const byTeam = useMemo(() => {
    const m = {};
    Object.entries(players || {}).forEach(([uid, p]) => { (m[p.team] ||= []).push({ uid, ...p }); });
    Object.values(m).forEach((a) => a.sort((x, y) => (x.joinedAt || 0) - (y.joinedAt || 0)));
    return m;
  }, [players]);
  const kick = async (p) => {
    const ok = await confirmDialog({ title: `Mời ${p.name} ra khỏi phòng?`, body: 'Bạn ấy sẽ không vào lại được phòng này.', confirmLabel: 'Mời ra', danger: true });
    if (!ok) return;
    try { await fb.update(kickUpdates({ code, uid: p.uid, teamId: p.team, repUid: reps?.[p.team] })); toast(`Đã mời ${p.name} ra khỏi phòng`); }
    catch (e) { toast(fb.describeError(e).text, 'error'); }
  };
  const total = Object.keys(players || {}).length;
  return html`<div class="stack">
    <div class="row spread"><h3>Người chơi</h3><span class="strong"><${Tab} text=${String(total)} /></span></div>
    ${total === 0 ? html`<p class="muted">Chưa có ai vào phòng.</p>` : null}
    ${teams.map((t) => {
      const ps = byTeam[t.id] || [];
      return html`<section key=${t.id} class="stack-s">
        <div class=${`chip team team--${t.id}`} style="justify-content:space-between"><span>${t.name}</span><span><${Tab} text=${String(ps.length)} /></span></div>
        <ul class="list">${ps.map((p) => html`<li key=${p.uid} class="plrow">
          <span class=${`dot ${presence?.[p.uid] ? 'dot--on' : 'dot--off'}`} title=${presence?.[p.uid] ? 'Đang trực tuyến' : 'Ngoại tuyến'}></span>
          <span class="grow plrow__name">${p.name}${reps?.[t.id] === p.uid ? html` <span class="chip">Đại diện</span>` : null}</span>
          ${submitted?.[p.uid] ? html`<span class="chip"><${Icon} name="check" />Đã nộp</span>` : null}
          <${Btn} small class="btn--icon" aria-label=${`Mời ${p.name} ra khỏi phòng`} icon="user-x" onClick=${() => kick(p)} />
        </li>`)}</ul></section>`;
    })}
  </div>`;
}

/* ---------------- answers tab ---------------- */
function AnswersPanel({ pub, answers, players }) {
  const items = Object.entries(answers || {}).map(([uid, a]) => ({ uid, ...a })).sort((x, y) => (x.t0 || 0) - (y.t0 || 0));
  return html`<div class="stack">
    <div class="row spread"><h3>Bài nộp</h3><span class="strong"><${Tab} text=${String(items.length)} /></span></div>
    ${pub.roundId === 'r0' ? html`<p class="muted">Chưa có câu hỏi nào được phát.</p>` : items.length === 0 ? html`<p class="muted">Chưa có bài nào.</p>` : null}
    <ul class="list">${items.map((a, i) => {
      const p = players?.[a.uid];
      return html`<li key=${a.uid} class="stack-s">
        <div class="row spread"><span class="strong">${p?.name || 'Đã rời phòng'}</span>${p ? html`<${TeamChip} id=${p.team} teams=${pub.settings.teams} />` : null}</div>
        <p class="qtext" style="white-space:pre-wrap">${a.text}</p>
        <span class="xs muted">${a.text.length} ký tự · bài ${i + 1}</span></li>`;
    })}</ul>
  </div>`;
}

/* ---------------- board ---------------- */
function HostBoard({ code, uid, pub }) {
  const playersQ = useDb(`rooms/${code}/players`);
  const presenceQ = useDb(`rooms/${code}/presence`);
  const repsQ = useDb(`rooms/${code}/reps`);
  const round = pub.roundId && pub.roundId !== 'r0' ? pub.roundId : null;
  const answersQ = useDb(round ? `rooms/${code}/answers/${round}` : null);
  const subQ = useDb(round ? `rooms/${code}/submitted/${round}` : null);
  const [tab, setTab] = useState('control');

  useEffect(() => {
    const off = fb.holdPresence(rp(code, `presence/${uid}`));
    return () => { try { off(); } catch { /* */ } };
  }, [code, uid]);

  // auto-lock once time AND the grace period are over (rules already refuse late answers)
  useEffect(() => {
    if (pub.phase !== 'answering' || pub.timer?.state !== 'running') return undefined;
    const wait = pub.timer.endsAt + (pub.settings.graceMs ?? 3000) - fb.serverNow() + 150;
    const id = setTimeout(() => { fb.update(lockUpdates({ code })).catch(() => {}); }, Math.max(0, wait));
    return () => clearTimeout(id);
  }, [pub.phase, pub.timer?.state, pub.timer?.endsAt, pub.roundId]);

  const players = playersQ.value || {};
  const joined = Object.keys(players);
  const submitted = subQ.value || {};
  const isTeam = pub.settings.mode === 'team';
  const teamsWith = [...new Set(joined.map((u) => players[u].team))];
  const submittedCount = isTeam ? teamsWith.filter((t) => repsQ.value?.[t] && submitted[repsQ.value[t]]).length : joined.filter((u) => submitted[u]).length;
  const expected = isTeam ? teamsWith.length : joined.length;

  const tabs = [['control', 'Điều khiển'], ['players', 'Người chơi'], ['answers', 'Bài nộp']];
  return html`<div class="host">
    <header class="host__bar">
      <div class="row row--nowrap"><span class="brand">Host</span><span class="chip"><${Tab} text=${code} class="wide" /></span><span class="chip">${PHASE_LABEL[pub.phase] || pub.phase}</span></div>
      <${ConnBadge} />
    </header>
    <nav class="host__tabs seg" aria-label="Mục">${tabs.map(([k, t]) => html`<button key=${k} aria-pressed=${tab === k} onClick=${() => setTab(k)}>${t}</button>`)}</nav>
    <main class="host__main scroll">
      <div class="host__grid">
        <div class="host__col" data-active=${tab === 'control'}>
          <${Share} code=${code} />
          <${Controls} code=${code} pub=${pub} joined=${joined.length} submittedCount=${submittedCount} expected=${expected} />
        </div>
        <div class="host__col" data-active=${tab === 'players'}><${PlayersPanel} code=${code} pub=${pub} players=${players} presence=${presenceQ.value} reps=${repsQ.value} submitted=${submitted} /></div>
        <div class="host__col" data-active=${tab === 'answers'}><${AnswersPanel} pub=${pub} answers=${answersQ.value} players=${players} /></div>
      </div>
    </main>
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
