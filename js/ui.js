import { h, Fragment } from '../vendor/preact.mjs';
import { useState, useEffect, useRef } from '../vendor/preact-hooks.mjs';
import htm from '../vendor/htm.mjs';
import qrcode from '../vendor/qrcode.mjs';
import { useConnected } from './hooks.js';
import { formatClock } from './lib/timer.js';
import { teamList } from './lib/teams.js';

export const html = htm.bind(h);
export { Fragment };

/* ---------- icons ---------- */
export const Icon = ({ name, size, class: cls = '' }) =>
  html`<svg class=${`icon ${cls}`} style=${size ? { width: size, height: size } : null} aria-hidden="true" focusable="false"><use href=${'#i-' + name} /></svg>`;

/* ---------- buttons ---------- */
export function Btn({ kind = '', icon, children, class: cls = '', big, small, block, ...rest }) {
  const c = ['btn', kind && `btn--${kind}`, big && 'btn--big', small && 'btn--small', block && 'btn--block', cls].filter(Boolean).join(' ');
  return html`<button type="button" class=${c} ...${rest}>${icon ? html`<${Icon} name=${icon} />` : null}${children}</button>`;
}

/* ---------- fixed-width characters (Be Vietnam Pro has no tabular figures) ---------- */
export function Tab({ text, class: cls = '' }) {
  return html`<span class=${`tab ${cls}`} aria-label=${text}>${[...String(text)].map((ch, i) => html`<span key=${i} class=${ch === ':' || ch === '.' ? 'sep' : ''} aria-hidden="true">${ch}</span>`)}</span>`;
}
export function CodeCells({ code }) {
  return html`<span class="codecells" aria-label=${`Mã phòng ${[...code].join(' ')}`}>${[...code].map((c, i) => html`<span key=${i} aria-hidden="true">${c}</span>`)}</span>`;
}
export const Clock = ({ ms, class: cls }) => html`<${Tab} text=${formatClock(ms)} class=${cls} />`;

/* ---------- team chip ---------- */
export function TeamChip({ id, teams, children }) {
  const t = teamList(teams).find((x) => x.id === id);
  return html`<span class=${`chip team team--${id}`}>${children ?? t?.name ?? id}</span>`;
}

/* ---------- connection badge (every screen) ---------- */
export function ConnBadge() {
  const { connected } = useConnected();
  return html`<span class=${`conn ${connected ? '' : 'conn--off'}`} role="status">
    <span class=${`dot ${connected ? 'dot--on' : ''}`}></span>${connected ? 'Trực tuyến' : 'Mất kết nối'}</span>`;
}

/* ---------- QR (inline SVG, crisp, white quiet zone) ---------- */
export function QR({ text, label, class: cls = '', style }) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (q.isDark(y, x)) { let w = 1; while (x + w < n && q.isDark(y, x + w)) w++; d += `M${x} ${y}h${w}v1h-${w}z`; x += w; } else x++;
    }
  }
  return html`<span class=${`qr ${cls}`} style=${style} role="img" aria-label=${label || 'Mã QR'}>
    <svg viewBox=${`0 0 ${n} ${n}`} xmlns="http://www.w3.org/2000/svg"><rect width=${n} height=${n} fill="#fff" /><path d=${d} fill="#111" /></svg></span>`;
}

/* ---------- toasts ---------- */
const toastBus = new Set();
let toastId = 0;
export const toast = (text, kind = '') => { const t = { id: ++toastId, text, kind }; toastBus.forEach((f) => f(t)); };
export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (t) => { setItems((a) => [...a, t]); setTimeout(() => setItems((a) => a.filter((x) => x.id !== t.id)), 3200); };
    toastBus.add(on);
    return () => toastBus.delete(on);
  }, []);
  return html`<div class="toasts" aria-live="polite">${items.map((t) => html`<div key=${t.id} class=${`toast ${t.kind ? 'toast--' + t.kind : ''}`}>${t.text}</div>`)}</div>`;
}

/* ---------- confirm dialog (destructive actions always ask) ---------- */
const dialogBus = new Set();
export const confirmDialog = (opts) => new Promise((resolve) => {
  if (!dialogBus.size) { resolve(window.confirm(opts.title)); return; }
  dialogBus.forEach((f) => f({ ...opts, resolve }));
});
export function DialogHost() {
  const [d, setD] = useState(null);
  const okRef = useRef(null);
  useEffect(() => { const on = (x) => setD(x); dialogBus.add(on); return () => dialogBus.delete(on); }, []);
  useEffect(() => { if (d) okRef.current?.focus(); }, [d]);
  if (!d) return null;
  const close = (v) => { d.resolve(v); setD(null); };
  return html`<div class="scrim" onClick=${(e) => e.target === e.currentTarget && close(false)}>
    <div class="card dialog stack" role="alertdialog" aria-modal="true" aria-label=${d.title}>
      <h3>${d.title}</h3>
      ${d.body ? html`<p>${d.body}</p>` : null}
      <div class="row">
        <${Btn} class="grow" onClick=${() => close(false)}>${d.cancelLabel || 'Huỷ'}<//>
        <button type="button" ref=${okRef} class=${`btn grow ${d.danger ? 'btn--danger' : 'btn--primary'}`} onClick=${() => close(true)}>${d.confirmLabel || 'Đồng ý'}</button>
      </div>
    </div></div>`;
}

/* ---------- panels ---------- */
export function ErrorPanel({ error, onRetry, retryLabel = 'Thử lại', text }) {
  return html`<div class="error" role="alert"><${Icon} name="alert" /><div class="stack-s grow"><span>${text}</span>
    ${onRetry ? html`<div><${Btn} small icon="refresh" onClick=${onRetry}>${retryLabel}<//></div>` : null}</div></div>`;
}

export const Spinner = () => html`<span class="spinner" role="status" aria-label="Đang tải"></span>`;

export function Field({ label, help, error, children }) {
  return html`<label class="field"><span class="label">${label}</span>${children}${help ? html`<span class="help">${help}</span>` : null}${error ? html`<span class="help" role="alert" style="color:var(--ink);font-weight:800">${error}</span>` : null}</label>`;
}

/** Clipboard with fallbacks: navigator.clipboard -> execCommand -> false (caller shows a select-all box). */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
