// TV views for the stage-2 phases. Read-only; names stay hidden until the reveal.
import { useRef, useLayoutEffect } from '../../vendor/preact-hooks.mjs';
import { html, Icon, Tab, Spinner } from '../ui.js';
import { teamList } from '../lib/teams.js';
import { rankBoard } from '../lib/scoring.js';
import { asArray } from '../lib/options.js';

/** Largest font size (in vh units) at which the text still fits its box; never below the floor. */
export function FitText({ text, maxVh = 7, minVh = 3.4, class: cls = '' }) {
  const box = useRef(null);
  const inner = useRef(null);
  useLayoutEffect(() => {
    const b = box.current, t = inner.current;
    if (!b || !t) return undefined;
    const fit = () => {
      const unit = parseFloat(getComputedStyle(b).getPropertyValue('--u')) || window.innerHeight / 100;
      const cs = getComputedStyle(b);
      const innerH = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      let lo = minVh, hi = maxVh, best = minVh;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        t.style.fontSize = `${mid * unit}px`;
        if (t.scrollHeight <= innerH + 1) { best = mid; lo = mid; } else hi = mid;
      }
      t.style.fontSize = `${best * unit}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    return () => ro.disconnect();
  }, [text, maxVh, minVh]);
  return html`<div class=${`fit ${cls}`} ref=${box}><div class="fit__text" ref=${inner}>${text}</div></div>`;
}

const snippet = (t, n = 200) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);
const colsFor = (n) => (n <= 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : n <= 6 ? 3 : 4);
const maxVhFor = (n) => (n <= 2 ? 9 : n <= 4 ? 7 : n <= 6 ? 5.6 : 4.4);

export function TvShowcase({ pub, scale }) {
  const items = asArray(pub.showcase?.items);
  const focus = pub.showcase?.focus;
  if (!items.length) return html`<div class="tv__msg"><h1>Đang chuẩn bị</h1></div>`;
  if (focus != null && items[focus]) {
    const it = items[focus];
    return html`<div class="tvfocus">
      <div class="row"><span class="tvno">Phương án <${Tab} text=${String(focus + 1)} /></span></div>
      ${it.hl ? html`<div class="tvfocus__hl">${it.hl}</div>` : null}
      <${FitText} text=${it.text} maxVh=${(it.hl ? 5.2 : 6.4) * scale} minVh=${2.6} />
    </div>`;
  }
  return html`<div class="tvopts" style=${{ '--cols': colsFor(items.length) }}>${items.map((it, i) => html`<article key=${i} class="tvopt">
    <div class="tvopt__bar"><span class="tvno">Phương án <${Tab} text=${String(i + 1)} /></span></div>
    <${FitText} text=${it.hl || snippet(it.text)} maxVh=${maxVhFor(items.length) * scale} minVh=${2.4} />
  </article>`)}</div>`;
}

export function TvVoting({ pub, scale, total }) {
  const items = asArray(pub.showcase?.items);
  const vote = pub.vote || {};
  const tally = asArray(vote.tally);
  const live = tally.length === items.length && items.length > 0;
  const top = Math.max(1, ...tally);
  return html`<div class="tv__stage">
    <div class="tv__legend">
      <span class="tvno"><${Icon} name="hand" />${vote.open ? 'Đang bình chọn' : 'Phiếu điện thoại đã đóng'}</span>
      <span>Bình chọn trên điện thoại hoặc giơ tay theo hướng dẫn của Host</span>
      ${vote.open || vote.n ? html`<span class="strong">Đã bình chọn <${Tab} text=${`${vote.n || 0}/${total}`} /></span>` : null}
    </div>
    <div class="tvopts" style=${{ '--cols': colsFor(items.length) }}>${items.map((it, i) => html`<article key=${i} class="tvopt">
      <div class="tvopt__bar"><span class="tvno">Phương án <${Tab} text=${String(i + 1)} /></span>
        ${live ? html`<div class="grow" aria-hidden="true"><i style=${{ width: `${((tally[i] || 0) / top) * 100}%` }}></i></div><span class="tvopt__n"><${Tab} text=${String(tally[i] || 0)} /></span>` : null}</div>
      <${FitText} text=${it.hl || snippet(it.text)} maxVh=${maxVhFor(items.length) * 0.85 * scale} minVh=${2.4} />
    </article>`)}</div>
  </div>`;
}

export function TvReveal({ pub, scale, teams }) {
  const rv = pub.reveal;
  const showItems = asArray(pub.showcase?.items);
  if (!rv) return html`<div class="tv__msg"><${Spinner} /></div>`;
  const all = Object.values(rv.items || {}).sort((a, b) => a.rank - b.rank);
  const win = all.filter((x) => x.honoured);
  const rest = all.filter((x) => !x.honoured);
  const tl = teamList(teams);
  const chip = (id) => html`<span class=${`tvteamchip team team--${id}`}>${tl.find((t) => t.id === id)?.name || id}</span>`;
  const textOf = (it) => { const s = showItems[it.n]; return s ? (s.hl || snippet(s.text, 240)) : ''; };
  return html`<div class="tvrank">
    <div class="tvwin" style=${{ '--wcols': win.length >= 3 ? 3 : win.length || 1 }}>${win.map((it, idx) => html`<article key=${it.n} class=${`tvwin__card ${it.rank === 1 ? 'is-first' : ''}`} style=${{ '--i': win.length - idx - 1 }}>
      <div class="tvwin__top"><span class="tvno">${it.rank === 1 ? html`<${Icon} name="trophy" />` : null}Hạng <${Tab} text=${String(it.rank)} /></span>${chip(it.team)}<span class="tvwin__pts">+<${Tab} text=${String(it.points)} /></span></div>
      <div class="tvwin__name">${it.name}</div>
      <div class="tvwin__text">Phương án ${it.n + 1}${textOf(it) ? ` · ${textOf(it)}` : ''}</div>
    </article>`)}</div>
    ${rest.length ? html`<div class="tvrest">${rest.map((it, idx) => html`<div key=${it.n} class="tvrest__row" style=${{ '--i': idx }}><span class="tvno"><${Tab} text=${String(it.rank)} /></span><span class="nm">${it.name}</span>${chip(it.team)}<span class="strong"><${Tab} text=${String(it.value)} /></span></div>`)}</div>` : null}
  </div>`;
}

export function TvLeaderboard({ pub, scale, teams, players }) {
  const board = pub.board || {};
  const tl = teamList(teams);
  const trows = rankBoard(board.t, tl.map((t) => t.id));
  const prows = rankBoard(board.p).filter((r) => players[r.id]).slice(0, 8);
  const topT = Math.max(1, ...trows.map((r) => r.points));
  const topP = Math.max(1, ...prows.map((r) => r.points));
  const color = (id) => tl.find((t) => t.id === id)?.color;
  return html`<div class="tvboards">
    <section class="tvboard"><h2 class="tv__h">Các tổ</h2>${trows.map((r) => html`<div key=${r.id} class="tvboard__row" data-id=${r.id} data-points=${r.points} data-rank=${r.rank} style=${{ '--tc': color(r.id) }}>
      <span class="tvboard__rank"><${Tab} text=${String(r.rank)} /></span>
      <div class="nm"><span class="t">${tl.find((t) => t.id === r.id)?.name}</span><div class="tvboard__bar"><i style=${{ width: `${Math.max(0, (r.points / topT) * 100)}%` }}></i></div></div>
      <span class="pts"><${Tab} text=${String(r.points)} /></span></div>`)}</section>
    <section class="tvboard tvboard--small"><h2 class="tv__h">Cá nhân</h2>${prows.length ? prows.map((r) => html`<div key=${r.id} class="tvboard__row" data-id=${r.id} data-points=${r.points} data-rank=${r.rank} style=${{ '--tc': 'var(--ink)' }}>
      <span class="tvboard__rank"><${Tab} text=${String(r.rank)} /></span>
      <div class="nm"><span class="t">${players[r.id]?.name}</span><div class="tvboard__bar"><i style=${{ width: `${(r.points / topP) * 100}%` }}></i></div></div>
      <span class="pts"><${Tab} text=${String(r.points)} /></span></div>`) : html`<p class="tv__sub">Chưa có điểm cá nhân.</p>`}</section>
  </div>`;
}
