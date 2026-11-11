import { useState, useEffect } from '../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Field, ErrorPanel, toast, ConnBadge } from '../ui.js';
import { normalizeCode, isValidCode, normalizePin, isValidPin, generatePin } from '../lib/roomcode.js';
import { routeHash } from '../lib/route.js';
import { describeError } from '../fb.js';
import { createRoom, claimHost, roomExists, recentHostRooms } from '../room.js';
import { store, K } from '../lib/storage.js';

const go = (hash) => { location.hash = hash; };

function JoinCard() {
  const [code, setCode] = useState(store.get(K.recentCode, '') || '');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!isValidCode(c)) { setErr('Mã phòng gồm 6 ký tự, ví dụ K7M2QX.'); return; }
    setBusy(true); setErr('');
    try {
      if (!(await roomExists(c))) { setErr(`Không tìm thấy phòng ${c}. Kiểm tra lại mã.`); return; }
      store.set(K.recentCode, c);
      go(routeHash('play', c));
    } catch (e2) { setErr(describeError(e2).text); } finally { setBusy(false); }
  };
  return html`<form class="card stack" onSubmit=${submit}>
    <h2>Vào phòng</h2>
    <${Field} label="Mã phòng" error=${err}>
      <input class="input input--code" value=${code} maxLength="10" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" inputmode="text" enterkeyhint="go"
        placeholder="K7M2QX" onInput=${(e) => { setCode(normalizeCode(e.target.value).slice(0, 6)); setErr(''); }} />
    <//>
    <${Btn} kind="primary" big type="submit" disabled=${busy || code.length < 6} icon="door">Vào phòng<//>
  </form>`;
}

function CreateCard({ uid }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [show, setShow] = useState(true);
  useEffect(() => { if (open && !pin) setPin(generatePin()); }, [open]);
  const create = async (e) => {
    e.preventDefault();
    if (!isValidPin(pin)) { setErr({ text: 'PIN gồm đúng 6 chữ số.' }); return; }
    setBusy(true); setErr(null);
    try { const code = await createRoom(uid, pin); go(routeHash('host', code)); }
    catch (e2) { setErr(describeError(e2)); } finally { setBusy(false); }
  };
  if (!open) return html`<section class="card stack"><h2>Tạo phòng</h2><${Btn} big icon="plus" onClick=${() => setOpen(true)}>Tạo phòng mới<//></section>`;
  return html`<form class="card stack" onSubmit=${create}>
    <h2>Tạo phòng</h2>
    <${Field} label="PIN của Host (6 số)" help="Nhớ PIN này. Thiết bị khác cần PIN để vào bảng Host.">
      <div class="row row--nowrap">
        <input class="input input--pin grow" type=${show ? 'text' : 'password'} inputmode="numeric" autocomplete="off" pattern="[0-9]*" value=${pin} maxLength="6"
          onInput=${(e) => { setPin(normalizePin(e.target.value)); setErr(null); }} />
        <${Btn} class="btn--icon" aria-label=${show ? 'Ẩn PIN' : 'Hiện PIN'} icon=${show ? 'eye-off' : 'eye'} onClick=${() => setShow(!show)} />
        <${Btn} class="btn--icon" aria-label="PIN ngẫu nhiên" icon="refresh" onClick=${() => setPin(generatePin())} />
      </div>
    <//>
    ${err ? html`<${ErrorPanel} text=${err.text} />` : null}
    <div class="row">
      <${Btn} class="grow" onClick=${() => setOpen(false)}>Huỷ<//>
      <${Btn} kind="primary" class="grow" type="submit" disabled=${busy || pin.length !== 6} icon="check">Tạo phòng<//>
    </div>
  </form>`;
}

function HostCard({ uid }) {
  const recents = recentHostRooms();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(recents[0]?.code || '');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!isValidCode(c)) { setErr('Mã phòng gồm 6 ký tự.'); return; }
    if (!isValidPin(pin)) { setErr('PIN gồm đúng 6 chữ số.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await claimHost(uid, c, pin);
      if (r.ok) { go(routeHash('host', c)); return; }
      setErr(r.reason === 'noroom' ? `Không tìm thấy phòng ${c}.`
        : r.reason === 'exhausted' ? 'Thiết bị này đã thử sai quá 8 lần. Dùng thiết bị khác hoặc xoá dữ liệu trình duyệt.'
        : `PIN chưa đúng. Còn ${r.left} lần thử.`);
    } catch (e2) { setErr(describeError(e2).text); } finally { setBusy(false); }
  };
  if (!open) return html`<section class="card stack"><h2>Bảng Host</h2>
    ${recents.length ? html`<div class="row">${recents.map((r) => html`<a key=${r.code} class="btn btn--small" href=${routeHash('host', r.code)}>${r.code}</a>`)}</div>` : null}
    <${Btn} icon="shield" onClick=${() => setOpen(true)}>Vào bảng Host bằng mã + PIN<//></section>`;
  return html`<form class="card stack" onSubmit=${submit}>
    <h2>Bảng Host</h2>
    <${Field} label="Mã phòng"><input class="input input--code" value=${code} maxLength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" onInput=${(e) => { setCode(normalizeCode(e.target.value).slice(0, 6)); setErr(''); }} /><//>
    <${Field} label="PIN Host" error=${err}><input class="input input--pin" type="password" inputmode="numeric" autocomplete="off" pattern="[0-9]*" maxLength="6" value=${pin} onInput=${(e) => { setPin(normalizePin(e.target.value)); setErr(''); }} /><//>
    <div class="row">
      <${Btn} class="grow" onClick=${() => setOpen(false)}>Huỷ<//>
      <${Btn} kind="primary" class="grow" type="submit" disabled=${busy || code.length < 6 || pin.length < 6} icon="key">Vào<//>
    </div>
  </form>`;
}

function TvCard() {
  const [code, setCode] = useState('');
  const c = normalizeCode(code);
  return html`<form class="card card--tight stack-s" onSubmit=${(e) => { e.preventDefault(); if (isValidCode(c)) go(routeHash('tv', c)); }}>
    <span class="label">Màn hình TV / máy chiếu</span>
    <div class="row row--nowrap">
      <input class="input input--code grow" value=${code} maxLength="10" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Mã phòng" aria-label="Mã phòng cho màn hình TV"
        onInput=${(e) => setCode(normalizeCode(e.target.value).slice(0, 6))} />
      <${Btn} type="submit" disabled=${!isValidCode(c)} icon="tv">Mở<//>
    </div>
  </form>`;
}

export function Home({ uid }) {
  return html`<main class="home scroll">
    <header class="home__head">
      <div class="row spread"><span class="brand">Xử lý tình huống</span><${ConnBadge} /></div>
      <h1>Đọc tình huống.<br />Gõ cách xử lý.</h1>
    </header>
    <div class="home__grid">
      <${JoinCard} />
      <${CreateCard} uid=${uid} />
      <${HostCard} uid=${uid} />
      <${TvCard} />
    </div>
  </main>`;
}
