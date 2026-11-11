import { useState, useMemo, useCallback, useEffect } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, TeamChip, memo, Tab } from '../../ui.js';
import { useDebounced } from '../../hooks.js';
import { findNearDuplicates, looksLikeInjection, matchesFilter } from '../../lib/answer-tools.js';
import { Seg } from './common.js';

const AnswerRow = memo(function AnswerRow({ uid, text, shown, name, team, teams, state, no, reason, edited, aid, dupText, flagged, gone, canSelect, canEdit, onChoose, onEdit }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const long = text.length > 220;
  const startEdit = () => { setDraft(shown); setEditing(true); setOpen(true); };
  return html`<li class=${`arow ${state === 'chosen' ? 'is-chosen' : ''} ${state === 'rejected' ? 'is-rejected' : ''}`} data-uid=${uid}>
    <div class="arow__head">
      ${aid ? html`<span class="chip chip--id">${aid}</span>` : null}
      <span class="strong arow__name">${name}</span>
      ${team ? html`<${TeamChip} id=${team} teams=${teams} />` : null}
      ${no ? html`<span class="chip chip--no">Phương án <${Tab} text=${String(no)} /></span>` : null}
      <span class="xs muted arow__len"><${Tab} text=${String(text.length)} /> ký tự</span>
    </div>
    <p class=${`qtext arow__text ${open || !long ? '' : 'is-clamped'}`}>${shown}</p>
    ${long ? html`<button type="button" class="linkbtn" onClick=${() => setOpen(!open)}>${open ? 'Thu gọn' : 'Xem thêm'}</button>` : null}
    <div class="arow__flags">
      ${dupText ? html`<span class="chip chip--warn"><${Icon} name="copy" />Giống ${dupText}</span>` : null}
      ${flagged ? html`<span class="chip chip--warn"><${Icon} name="alert" />Có dấu hiệu ra lệnh cho AI</span>` : null}
      ${edited ? html`<span class="chip">Đã sửa chữ</span>` : null}
      ${gone ? html`<span class="chip">Đã rời phòng</span>` : null}
      ${reason && state === 'chosen' ? html`<span class="xs muted">AI: ${reason}</span>` : null}
      ${reason && state === 'rejected' ? html`<span class="xs muted">Loại: ${reason}</span>` : null}
    </div>
    ${editing ? html`<div class="stack-s">
      <textarea class="textarea" rows="4" value=${draft} aria-label="Sửa chữ hiển thị" onInput=${(e) => setDraft(e.target.value)}></textarea>
      <p class="help">Chỉ sửa lỗi gõ hoặc chính tả. Bản gốc của bạn học sinh vẫn được giữ.</p>
      <div class="row"><${Btn} small kind="primary" icon="check" onClick=${() => { onEdit(uid, draft); setEditing(false); }}>Lưu<//>
        ${edited ? html`<${Btn} small icon="undo" onClick=${() => { onEdit(uid, ''); setEditing(false); }}>Khôi phục bản gốc<//>` : null}
        <${Btn} small onClick=${() => setEditing(false)}>Huỷ<//></div></div>` : null}
    <div class="arow__actions">
      ${canSelect ? html`
        <${Btn} small kind=${state === 'chosen' ? 'primary' : ''} icon="check" disabled=${gone} aria-pressed=${state === 'chosen'} onClick=${() => onChoose(uid, state === 'chosen' ? null : 'chosen')}>${state === 'chosen' ? 'Đã chọn' : 'Chọn'}<//>
        <${Btn} small icon="x" aria-pressed=${state === 'rejected'} onClick=${() => onChoose(uid, state === 'rejected' ? null : 'rejected')}>${state === 'rejected' ? 'Đã loại' : 'Loại'}<//>` : null}
      ${canEdit && !editing ? html`<${Btn} small icon="edit" onClick=${startEdit}>Sửa chữ<//>` : null}
    </div>
  </li>`;
});

export function AnswerList({ ctx, selectable }) {
  const { answers, players, review, order, aid, settings, pub, actions } = ctx;
  const [filter, setFilter] = useState('all');
  const [team, setTeam] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebounced(query, 180);

  const items = useMemo(() => Object.entries(answers).map(([uid, a]) => ({ uid, text: a.text, t0: a.t0 ?? a.ts ?? 0 })).sort((x, y) => x.t0 - y.t0 || (x.uid < y.uid ? -1 : 1)), [answers]);
  const dups = useMemo(() => findNearDuplicates(items), [items]);
  const flags = useMemo(() => new Set(items.filter((it) => looksLikeInjection(it.text)).map((it) => it.uid)), [items]);
  const inOrder = useMemo(() => new Map(order.map((u, i) => [u, i + 1])), [order]);
  const labelOf = useCallback((uid) => aid[uid] || `#${items.findIndex((x) => x.uid === uid) + 1}`, [aid, items]);

  const onChoose = useCallback((uid, st) => ctx.ref.current.actions.choose(uid, st), [ctx.ref]);
  const onEdit = useCallback((uid, text) => ctx.ref.current.actions.editText(uid, text), [ctx.ref]);

  const rows = items.map((it) => {
    const p = players[it.uid];
    const rv = review[it.uid];
    const state = inOrder.has(it.uid) ? 'chosen' : rv?.st === 'rejected' ? 'rejected' : null;
    const edit = typeof rv?.edit === 'string' ? rv.edit.trim() : '';
    const edited = !!edit && edit !== it.text;
    return { it, p, rv, state, edited, shown: edited ? edit : it.text };
  });
  const visible = rows.filter((r) => matchesFilter({ text: r.shown, name: r.p?.name, team: r.p?.team }, { filter, team, query: q }, { st: r.state }));
  const counts = { chosen: rows.filter((r) => r.state === 'chosen').length, rejected: rows.filter((r) => r.state === 'rejected').length };
  const teamList = Object.keys(settings.teams);
  const canSelect = selectable && pub.phase === 'reviewing';
  const canEdit = ['locked', 'reviewing', 'showcase'].includes(pub.phase);

  return html`<div class="stack">
    <div class="row spread"><h3>Bài nộp</h3><span class="strong"><${Tab} text=${String(rows.length)} /></span></div>
    ${pub.roundId === 'r0' ? html`<p class="muted">Chưa có câu hỏi nào được phát.</p>` : null}
    ${rows.length ? html`<div class="stack-s">
      <label class="searchbox"><${Icon} name="search" /><input class="input" type="search" placeholder="Tìm trong bài nộp" aria-label="Tìm trong bài nộp" value=${query} onInput=${(e) => setQuery(e.target.value)} /></label>
      <${Seg} small label="Lọc" value=${filter} onChange=${setFilter} options=${[['all', `Tất cả`], ['open', 'Chưa duyệt'], ['chosen', `Đã chọn ${counts.chosen}`], ['rejected', `Đã loại ${counts.rejected}`]]} />
      <select class="select" aria-label="Lọc theo tổ" value=${team} onChange=${(e) => setTeam(e.target.value)}>
        <option value="">Mọi tổ</option>${teamList.map((id) => html`<option key=${id} value=${id}>${settings.teams[id].name}</option>`)}
      </select>
    </div>` : null}
    ${rows.length && !visible.length ? html`<p class="muted">Không có bài nào khớp bộ lọc.</p>` : null}
    <ul class="list alist">${visible.map(({ it, p, rv, state, edited, shown }) => html`<${AnswerRow} key=${it.uid}
      uid=${it.uid} text=${it.text} shown=${shown} name=${p?.name || 'Đã rời phòng'} team=${p?.team} teams=${settings.teams} state=${state} no=${inOrder.get(it.uid) || 0}
      reason=${rv?.reason || ''} edited=${edited} aid=${aid[it.uid] || ''} dupText=${(dups.get(it.uid) || []).map(labelOf).join(', ')} flagged=${flags.has(it.uid)} gone=${!p}
      canSelect=${canSelect} canEdit=${canEdit} onChoose=${onChoose} onEdit=${onEdit} />`)}</ul>
  </div>`;
}
