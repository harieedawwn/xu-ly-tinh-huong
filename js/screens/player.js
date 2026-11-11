import { useState, useEffect, useRef, useMemo, useCallback } from '../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Field, ErrorPanel, Spinner, ConnBadge, TeamChip, Clock, toast, Tab } from '../ui.js';
import * as fb from '../fb.js';
import { useDb, useCountdown, useTick, useConnected } from '../hooks.js';
import { rp, joinRecord, submitUpdates } from '../lib/room-ops.js';
import { validateName, uniqueName, validateAnswer, NAME_MAX } from '../lib/validate.js';
import { teamList } from '../lib/teams.js';
import { isSubmitWindowOpen } from '../lib/timer.js';
import { store, K } from '../lib/storage.js';
import { canFullscreen } from '../lib/device.js';
import { toggleFullscreen, fullscreenElement } from '../lib/viewport.js';
import { routeHash } from '../lib/route.js';

const NAME_ERR = {
  empty: 'Nhập tên của bạn.',
  short: 'Tên cần ít nhất 2 ký tự.',
  long: `Tên tối đa ${NAME_MAX} ký tự.`,
  profane: 'Tên này không phù hợp. Hãy chọn tên khác.',
};
const ANS_ERR = {
  empty: 'Chưa có nội dung.',
  short: (n) => `Cần thêm ${n} ký tự nữa.`,
  long: (n) => `Dài quá ${n} ký tự.`,
  spam: 'Câu trả lời lặp lại ký tự. Hãy viết ý của bạn.',
};
const SIZES = { s: 0.9, m: 1, l: 1.2 };

/* ---------------- player settings ---------------- */
function Settings({ onClose }) {
  const [size, setSize] = useState(store.get(K.playerSize, 'm'));
  const [fs, setFs] = useState(!!fullscreenElement());
  const apply = (k) => { setSize(k); store.set(K.playerSize, k); document.documentElement.style.setProperty('--player-scale', SIZES[k]); };
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="card dialog stack" role="dialog" aria-label="Cài đặt">
      <div class="row spread"><h3>Cài đặt</h3><${Btn} class="btn--icon" aria-label="Đóng" icon="x" onClick=${onClose} /></div>
      <div class="stack-s"><span class="label">Cỡ chữ</span>
        <div class="seg">${[['s', 'Nhỏ'], ['m', 'Vừa'], ['l', 'Lớn']].map(([k, t]) => html`<button key=${k} aria-pressed=${size === k} onClick=${() => apply(k)}>${t}</button>`)}</div></div>
      ${canFullscreen(document)
        ? html`<${Btn} icon=${fs ? 'minimize' : 'maximize'} onClick=${async () => { await toggleFullscreen(); setFs(!!fullscreenElement()); }}>${fs ? 'Thoát toàn màn hình' : 'Toàn màn hình'}<//>`
        : html`<p class="help">Trên iPhone, mở bằng Safari hoặc thêm vào Màn hình chính để có toàn màn hình.</p>`}
    </div></div>`;
}

/* ---------------- join form ---------------- */
function JoinForm({ code, uid, pub, players }) {
  const teams = teamList(pub.settings?.teams);
  const [name, setName] = useState(store.get('xlth.name', ''));
  const [team, setTeam] = useState(store.get(`xlth.team.${code}`, ''));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = pub.settings?.lockJoin === true;
  const counts = useMemo(() => {
    const c = {};
    Object.values(players || {}).forEach((p) => { c[p.team] = (c[p.team] || 0) + 1; });
    return c;
  }, [players]);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateName(name);
    if (!v.ok) { setErr(NAME_ERR[v.error]); return; }
    if (!team || !teams.some((t) => t.id === team)) { setErr('Chọn tổ của bạn.'); return; }
    setBusy(true); setErr('');
    try {
      const existing = Object.values(players || {}).map((p) => p.name);
      const finalName = uniqueName(v.value, existing);
      await fb.set(rp(code, `players/${uid}`), joinRecord({ name: finalName, team, ts: fb.serverTs() }));
      store.set('xlth.name', v.value); store.set(`xlth.team.${code}`, team);
    } catch (e2) {
      const d = fb.describeError(e2);
      setErr(d.kind === 'denied' ? 'Không vào được phòng. Phòng có thể đã khoá, hãy hỏi Host.' : d.text);
    } finally { setBusy(false); }
  };

  return html`<main class="player scroll"><form class="card stack" onSubmit=${submit}>
    <div class="row spread"><span class="brand">Phòng <${Tab} text=${code} class="wide" /></span><${ConnBadge} /></div>
    <h2>Bạn là ai?</h2>
    <${Field} label="Tên của bạn" error=${err && !err.startsWith('Chọn tổ') ? err : ''}>
      <input class="input" value=${name} maxLength="40" autocomplete="nickname" autocapitalize="words" enterkeyhint="done" placeholder="Ví dụ: Minh Anh"
        onInput=${(e) => { setName(e.target.value); setErr(''); }} />
    <//>
    <div class="stack-s"><span class="label">Chọn tổ</span>
      <div class="teampick">${teams.map((t) => html`<button type="button" key=${t.id} class=${`team team--${t.id}`} aria-pressed=${team === t.id} onClick=${() => { setTeam(t.id); setErr(''); }}>${t.name}
        <span class="xs" style="display:block;font-weight:600">${counts[t.id] || 0} bạn</span></button>`)}</div>
      ${err.startsWith('Chọn tổ') ? html`<span class="help" role="alert" style="color:var(--ink);font-weight:800">${err}</span>` : null}
    </div>
    ${locked ? html`<${ErrorPanel} text="Phòng đã khoá, chưa vào thêm được. Hỏi Host." />` : null}
    <${Btn} kind="primary" big type="submit" disabled=${busy || locked} icon="check">Vào phòng<//>
  </form></main>`;
}

/* ---------------- header + waiting views ---------------- */
function Header({ code, me, teams, onSettings, right }) {
  return html`<header class="player__bar">
    <div class="row row--nowrap"><${TeamChip} id=${me.team} teams=${teams} /><span class="strong player__name">${me.name}</span></div>
    <div class="row row--nowrap">${right}<${ConnBadge} /><${Btn} small class="btn--icon" aria-label="Cài đặt" icon="settings" onClick=${onSettings} /></div>
  </header>`;
}

function Waiting({ title, children }) {
  return html`<div class="center stack"><div class="card stack" style="text-align:center"><h2>${title}</h2>${children}</div></div>`;
}

/* ---------------- representative (team mode) ---------------- */
function RepBlock({ code, uid, me, teams, reps, players }) {
  const repUid = reps?.[me.team];
  const repName = repUid ? players?.[repUid]?.name : null;
  const [busy, setBusy] = useState(false);
  const claim = async () => {
    setBusy(true);
    try { await fb.set(rp(code, `reps/${me.team}`), uid); }
    catch { toast('Tổ đã có đại diện rồi.', 'error'); }
    finally { setBusy(false); }
  };
  if (repUid === uid) return html`<div class="chip">Bạn là đại diện tổ</div>`;
  if (repUid) return html`<div class="card card--tight stack-s"><span class="label">Đại diện tổ</span><span>${repName || 'Một bạn trong tổ'} sẽ nộp bài cho cả tổ. Hãy bàn với bạn ấy.</span></div>`;
  return html`<div class="card card--tight stack-s"><span>Tổ chưa có đại diện. Một bạn nhận để nộp bài cho cả tổ.</span><${Btn} kind="primary" disabled=${busy} onClick=${claim}>Nhận làm đại diện<//></div>`;
}

/* ---------------- answering view ---------------- */
function Answering({ code, uid, me, pub, reps, players }) {
  const { roundId, question, timer, settings } = pub;
  const min = settings.minChars, max = settings.maxChars, grace = settings.graceMs;
  const ans = useDb(`rooms/${code}/answers/${roundId}/${uid}`);
  const ms = useCountdown(timer);
  useTick(500);
  const { connected } = useConnected();
  const submittedFlag = ans.value?.text != null;
  const draftKey = K.draft(code, roundId);
  const [text, setText] = useState(() => store.get(draftKey, ''));
  const [dirty, setDirty] = useState(false);
  const [send, setSend] = useState('idle'); // idle | sending | queued | sent | error
  const [sendErr, setSendErr] = useState('');
  const seeded = useRef(false);
  const isTeam = settings.mode === 'team';
  const isRep = !isTeam || reps?.[me.team] === uid;

  // restore from the database after F5 (own answer wins over an older local draft once)
  useEffect(() => {
    if (!ans.loaded || seeded.current) return;
    seeded.current = true;
    if (ans.value?.text && !store.get(draftKey)) setText(ans.value.text);
    if (ans.value?.text) setSend('sent');
  }, [ans.loaded, ans.value?.text]);

  // autosave draft locally
  useEffect(() => {
    if (!dirty) return undefined;
    const id = setTimeout(() => store.set(draftKey, text), 350);
    return () => clearTimeout(id);
  }, [text, dirty]);

  const windowOpen = isSubmitWindowOpen(timer, grace, fb.serverNow());
  const v = validateAnswer(text, { min, max });
  const len = text.length;
  const unchanged = submittedFlag && v.ok && v.value === ans.value?.text;
  const canEdit = !submittedFlag || settings.allowEdit;
  const hint = !text.trim() ? '' : v.ok ? '' : v.error === 'short' ? ANS_ERR.short(min - len) : v.error === 'long' ? ANS_ERR.long(len - max) : ANS_ERR[v.error];

  const doSubmit = useCallback(async (auto = false) => {
    const val = validateAnswer(text, { min, max });
    if (!val.ok || !fb.serverNow) return;
    setSend('sending'); setSendErr('');
    const queued = setTimeout(() => setSend((s) => (s === 'sending' && !navigator.onLine ? 'queued' : s)), 2500);
    try {
      await fb.update(submitUpdates({ code, roundId, uid, text: val.value, ts: fb.serverTs(), t0: ans.value?.t0 ?? fb.serverTs() }));
      store.set(draftKey, val.value);
      setDirty(false); setSend('sent');
      if (auto) toast('Hết giờ, đã tự nộp bài của bạn.');
    } catch (e) {
      const d = fb.describeError(e);
      setSend('error');
      setSendErr(d.kind === 'denied' ? 'Không nộp được: đã hết giờ hoặc Host đã khoá bài.' : d.text);
    } finally { clearTimeout(queued); }
  }, [text, min, max, code, roundId, uid, ans.value?.t0]);

  // auto-submit the draft at time up (inside the grace window)
  const autoDone = useRef(false);
  useEffect(() => { autoDone.current = false; }, [roundId]);
  useEffect(() => {
    if (ms > 0 || timer?.state !== 'running' || autoDone.current) return;
    if (settings.autoSubmit === false || !isRep || !ans.loaded) return;
    autoDone.current = true;
    if (v.ok && !unchanged && windowOpen && send !== 'sending') doSubmit(true);
  }, [ms, timer?.state, ans.loaded]);

  const over = timer?.state === 'running' && !windowOpen;
  const disabled = !isRep || over || send === 'sending' || !v.ok || unchanged || !canEdit;
  const label = send === 'sending' ? 'Đang gửi…' : submittedFlag ? 'Cập nhật bài' : 'Nộp bài';

  const status = send === 'sending' ? html`<span class="status"><${Spinner} /> Đang gửi…</span>`
    : send === 'queued' || (!connected && send === 'sending') ? html`<span class="status"><${Icon} name="wifi-off" /> Chưa có mạng. Bài sẽ tự gửi khi kết nối lại.</span>`
    : send === 'error' ? html`<span class="status" role="alert"><${Icon} name="alert" /> ${sendErr}</span>`
    : submittedFlag || send === 'sent' ? html`<span class="status status--ok" role="status"><${Icon} name="check-circle" /> Đã nộp${settings.allowEdit && !over ? '. Bạn vẫn sửa được đến hết giờ.' : '.'}</span>` : null;

  return html`<div class="editor">
    <div class="editor__top">
      <${TeamChip} id=${me.team} teams=${settings.teams} />
      <div class=${`timer ${ms <= 10_000 && timer?.state === 'running' ? 'timer--hot' : ''}`} role="timer" aria-live="off"><${Clock} ms=${ms} />${timer?.state === 'paused' ? html`<span class="xs"> tạm dừng</span>` : null}</div>
    </div>
    <section class="editor__q"><h3>${question?.title}</h3><p class="qtext">${question?.text}</p></section>
    ${isTeam ? html`<${RepBlock} code=${code} uid=${uid} me=${me} teams=${settings.teams} reps=${reps} players=${players} />` : null}
    ${isRep ? html`<div class="editor__box">
      <textarea class="textarea" value=${text} maxLength=${max + 200} rows="4" disabled=${over || !canEdit} enterkeyhint="enter" autocapitalize="sentences" autocomplete="off" spellcheck="true"
        placeholder="Gõ cách xử lý của bạn…" aria-label="Câu trả lời"
        onInput=${(e) => { setText(e.target.value); setDirty(true); if (send === 'sent') setSend('idle'); }}></textarea>
      <div class="editor__meta"><span class=${`count ${len > max || (len > 0 && len < min) ? 'count--bad' : ''}`}><${Tab} text=${String(len)} />/${max}</span><span class="xs muted">tối thiểu ${min}</span></div>
      ${hint ? html`<div class="help" role="alert">${hint}</div>` : null}
      ${status}
      <${Btn} kind="primary" big disabled=${disabled} onClick=${() => doSubmit(false)} icon="send">${label}<//>
      ${over ? html`<p class="help">Hết giờ, không nhận thêm bài.</p>` : null}
    </div>` : null}
  </div>`;
}

/* ---------------- after time ---------------- */
function Locked({ code, uid, pub }) {
  const ans = useDb(`rooms/${code}/answers/${pub.roundId}/${uid}`);
  const sent = ans.value?.text != null;
  return html`<div class="center stack">
    <div class="card stack" style="text-align:center">
      <h2>${pub.phase === 'locked' ? 'Hết giờ' : 'Host đang xử lý'}</h2>
      ${ans.loaded ? (sent ? html`<p class="status status--ok" style="justify-content:center"><${Icon} name="check-circle" /> Bài của bạn đã được nộp.</p>` : html`<p>Bạn chưa nộp bài trong vòng này.</p>`) : null}
      <p class="muted">Nhìn lên màn hình lớp để theo dõi.</p>
    </div>
    ${sent ? html`<div class="card card--flat stack-s"><span class="label">Bài của bạn</span><p class="qtext" style="white-space:pre-wrap">${ans.value.text}</p></div>` : null}
  </div>`;
}

/* ---------------- screen ---------------- */
export function PlayerScreen({ code, uid }) {
  const pubQ = useDb(`rooms/${code}/public`);
  const meQ = useDb(`rooms/${code}/players/${uid}`);
  const banQ = useDb(`rooms/${code}/banned/${uid}`);
  const playersQ = useDb(`rooms/${code}/players`);
  const repsQ = useDb(`rooms/${code}/reps`);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pub = pubQ.value;
  const me = meQ.value;

  useEffect(() => { document.documentElement.style.setProperty('--player-scale', SIZES[store.get(K.playerSize, 'm')] || 1); }, []);
  useEffect(() => {
    if (!me || banQ.value === true) return undefined;
    const off = fb.holdPresence(rp(code, `presence/${uid}`));
    return () => { try { off(); } catch { /* */ } fb.remove(rp(code, `presence/${uid}`)).catch(() => {}); };
  }, [!!me, code, uid, banQ.value]);

  if (pubQ.error) return html`<main class="player scroll"><${ErrorPanel} text=${fb.describeError(pubQ.error).text} onRetry=${() => location.reload()} /></main>`;
  if (!pubQ.loaded || !meQ.loaded || !banQ.loaded) return html`<div class="center"><${Spinner} /></div>`;
  if (pub == null) return html`<main class="player scroll"><div class="card stack"><h2>Không tìm thấy phòng</h2><p>Phòng ${code} không tồn tại hoặc Host đã kết thúc.</p><a class="btn btn--primary" href="#/">Về trang chủ</a></div></main>`;
  if (banQ.value === true) return html`<main class="player scroll"><div class="card stack"><h2>Bạn đã rời phòng</h2><p>Host đã mời bạn ra khỏi phòng này.</p><a class="btn" href="#/">Về trang chủ</a></div></main>`;
  if (!me) return html`<${JoinForm} code=${code} uid=${uid} pub=${pub} players=${playersQ.value} />`;

  const settings = pub.settings || {};
  const phase = pub.phase;
  let body;
  if (phase === 'lobby') {
    const n = Object.keys(playersQ.value || {}).length;
    body = html`<div class="center stack"><div class="card stack" style="text-align:center">
      <h2>Chờ Host bắt đầu</h2><p>Có ${n} bạn trong phòng.</p></div>
      ${settings.mode === 'team' ? html`<${RepBlock} code=${code} uid=${uid} me=${me} teams=${settings.teams} reps=${repsQ.value} players=${playersQ.value} />` : null}</div>`;
  } else if (phase === 'answering') {
    body = html`<${Answering} key=${pub.roundId} code=${code} uid=${uid} me=${me} pub=${{ ...pub, settings }} reps=${repsQ.value} players=${playersQ.value} />`;
  } else {
    body = html`<${Locked} code=${code} uid=${uid} pub=${pub} />`;
  }
  return html`<div class="player player--live">
    <${Header} code=${code} me=${me} teams=${settings.teams} onSettings=${() => setSettingsOpen(true)} />
    <main class="player__main">${body}</main>
    ${settingsOpen ? html`<${Settings} onClose=${() => setSettingsOpen(false)} />` : null}
  </div>`;
}
