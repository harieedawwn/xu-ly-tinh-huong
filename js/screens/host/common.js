import { html, Btn, Icon, Tab } from '../../ui.js';

export const PHASE_LABEL = {
  lobby: 'Sảnh chờ', answering: 'Đang nộp bài', locked: 'Đã khoá bài', reviewing: 'Đang chấm', showcase: 'Trình chiếu',
  voting: 'Bình chọn', scoring: 'Chấm điểm', reveal: 'Công bố', leaderboard: 'Bảng điểm',
};

export function Toggle({ label, help, on, onChange, disabled }) {
  return html`<button type="button" class="toggle" role="switch" aria-checked=${on} disabled=${disabled} onClick=${() => onChange(!on)}>
    <span class="grow" style="text-align:left"><span class="strong">${label}</span>${help ? html`<span class="help" style="display:block">${help}</span>` : null}</span>
    <span class=${`toggle__box ${on ? 'is-on' : ''}`} aria-hidden="true">${on ? html`<${Icon} name="check" />` : null}</span></button>`;
}

export function Seg({ label, value, options, onChange, small }) {
  return html`<div class=${`seg ${small ? 'seg--small' : ''}`} role="group" aria-label=${label}>${options.map(([v, t]) =>
    html`<button key=${String(v)} type="button" aria-pressed=${value === v} onClick=${() => onChange(v)}>${t}</button>`)}</div>`;
}

export const fmtScore = (v) => (v == null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '').replace(/\.$/, ''));

export function Count({ n }) { return html`<${Tab} text=${String(n)} />`; }

export function Section({ title, right, children }) {
  return html`<section class="card stack"><div class="row spread"><h3>${title}</h3>${right}</div>${children}</section>`;
}

export function Empty({ children }) { return html`<p class="muted">${children}</p>`; }

export { Btn, Icon, Tab, html };
