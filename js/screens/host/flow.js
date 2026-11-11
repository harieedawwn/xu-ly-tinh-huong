// Host panels for showcase, voting, scoring, reveal and leaderboard. They only render state and call actions.
import { useState } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Tab, TeamChip, Stepper, inputDialog, toast } from '../../ui.js';
import { A } from '../../lib/phases.js';
import { rankBoard, PLACE_POINTS } from '../../lib/scoring.js';
import { teamList } from '../../lib/teams.js';
import { Seg, Section, Empty, fmtScore, Toggle } from './common.js';

const snippet = (t, n = 90) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t);

/* ------------------------------------------------------------------ showcase */
function OptionCard({ o, i, last, focused, actions, canMove }) {
  return html`<li class=${`opt ${focused ? 'is-focus' : ''}`}>
    <div class="row spread opt__head">
      <span class="chip chip--no">Phương án <${Tab} text=${String(i + 1)} /></span>
      <span class="xs muted">${o.id || ''}${o.edited ? ' · đã sửa chữ' : ''}</span>
      <div class="row row--nowrap">
        <${Btn} small class="btn--icon" aria-label="Đưa lên" icon="up" disabled=${!canMove || i === 0} onClick=${() => actions.move(o.uid, -1)} />
        <${Btn} small class="btn--icon" aria-label="Đưa xuống" icon="down" disabled=${!canMove || i === last} onClick=${() => actions.move(o.uid, 1)} />
        <${Btn} small class="btn--icon" aria-label="Bỏ phương án này" icon="x" disabled=${!canMove} onClick=${() => actions.removeOption(o.uid)} />
      </div>
    </div>
    <label class="field"><span class="label">Nội dung hiển thị</span>
      <textarea key=${`t-${o.uid}-${o.text.length}`} class="textarea" rows="4" defaultValue=${o.text} onBlur=${(e) => { if (e.target.value.trim() !== o.text) actions.editText(o.uid, e.target.value); }}></textarea></label>
    <label class="field"><span class="label">Câu nổi bật (hiện lớn trên TV)</span>
      <input key=${`h-${o.uid}-${o.hl}`} class="input" maxLength="300" defaultValue=${o.hl} placeholder="Tối đa khoảng 25 từ" onBlur=${(e) => { if (e.target.value.trim() !== o.hl) actions.setHighlight(o.uid, e.target.value); }} /></label>
    <${Btn} small icon="tv" aria-pressed=${focused} onClick=${() => actions.focus(focused ? null : i)}>${focused ? 'Đang chiếu riêng. Bấm để chiếu tất cả' : 'Chiếu riêng phương án này'}<//>
  </li>`;
}

export function ShowcasePanel({ ctx, onOpenScript }) {
  const { options, pub, actions, ai } = ctx;
  const focus = pub.showcase?.focus;
  return html`<${Section} title=${`Trình chiếu ${options.length} phương án`}>
    <p class="help">Tên người viết được ẩn cho đến khi bạn công bố người thắng. Sửa nội dung hoặc câu nổi bật xong, chạm ra ngoài ô để cập nhật lên TV.</p>
    <div class="row">
      <${Btn} small icon="tv" disabled=${focus == null} onClick=${() => actions.focus(null)}>Chiếu tất cả phương án<//>
      ${ai?.script || ai?.raw ? html`<${Btn} small icon="book" onClick=${onOpenScript}>Lời dẫn của Host<//>` : null}
    </div>
    <ul class="list optlist">${options.map((o, i) => html`<${OptionCard} key=${o.uid} o=${o} i=${i} last=${options.length - 1} focused=${focus === i} actions=${actions} canMove=${pub.phase === 'showcase'} />`)}</ul>
  <//>`;
}

/* ------------------------------------------------------------------ voting */
export function VotingPanel({ ctx, onOpenScript }) {
  const { options, pub, hand, counts, phoneCounts, voted, players, settings, actions, step, setSetting, ai } = ctx;
  const open = pub.vote?.open === true;
  const total = Object.keys(players).length;
  return html`<div class="stack">
    <${Section} title="Bình chọn trên điện thoại">
      <div class="kv"><span>Trạng thái</span><span class="strong">${open ? 'Đang mở' : 'Đang đóng'}</span></div>
      <div class="kv"><span>Đã bình chọn</span><span class="strong"><${Tab} text=${`${voted}/${total}`} /></span></div>
      <${Btn} icon=${open ? 'lock' : 'unlock'} disabled=${!settings.phoneVoting && !open} onClick=${() => step(A.SET_VOTE_OPEN, { open: !open })}>${open ? 'Đóng bình chọn trên điện thoại' : 'Mở bình chọn trên điện thoại'}<//>
      ${!settings.phoneVoting ? html`<p class="help">Bình chọn bằng điện thoại đang tắt trong Cài đặt.</p>` : null}
      <${Toggle} label="Hiện kết quả trực tiếp trên TV" on=${settings.liveTally} onChange=${(v) => setSetting('liveTally', v)} />
    <//>
    <${Section} title="Giơ tay" right=${ai?.script || ai?.raw ? html`<${Btn} small icon="book" onClick=${onOpenScript}>Lời dẫn<//>` : null}>
      <p class="help">Đếm số tay giơ cho từng phương án rồi nhập bằng nút + và −. Số phiếu giơ tay được cộng với phiếu điện thoại.</p>
      <ul class="list votelist">${options.map((o, i) => html`<li key=${o.uid} class="vrow">
        <div class="vrow__t"><span class="chip chip--no">Phương án <${Tab} text=${String(i + 1)} /></span><span class="xs muted">${snippet(o.text, 90)}</span></div>
        <div class="vrow__c">
          <${Btn} class="btn--icon btn--bigicon" aria-label=${`Bớt một tay cho phương án ${i + 1}`} icon="minus" disabled=${!(Number(hand[i]) > 0)} onClick=${() => actions.hand(i, -1)} />
          <span class="vrow__n"><${Tab} text=${String(Number(hand[i]) || 0)} /></span>
          <${Btn} class="btn--icon btn--bigicon" aria-label=${`Thêm một tay cho phương án ${i + 1}`} icon="plus" onClick=${() => actions.hand(i, 1)} />
          <span class="xs muted vrow__sum">Điện thoại <${Tab} text=${String(phoneCounts[i] || 0)} /><br />Tổng <${Tab} text=${String(counts[i] || 0)} /></span>
        </div>
      </li>`)}</ul>
    <//>
  </div>`;
}

/* ------------------------------------------------------------------ scoring */
function ScoreCard({ r, ctx }) {
  const { settings, actions, options } = ctx;
  const o = options.find((x) => x.uid === r.key);
  const [open, setOpen] = useState(false);
  return html`<li class=${`scard ${r.rank <= settings.awardTop ? 'is-top' : ''}`}>
    <div class="scard__head"><span class="rankbadge"><${Tab} text=${String(r.rank)} /></span>
      <span class="chip chip--no">Phương án <${Tab} text=${String(r.n + 1)} /></span>
      ${r.rank <= settings.awardTop ? html`<span class="chip chip--icon" title="Được vinh danh" role="img" aria-label="Được vinh danh"><${Icon} name="award" /></span>` : null}
      <span class="grow"></span><span class="strong scard__final"><${Tab} text=${fmtScore(r.value)} /></span></div>
    <p class="qtext scard__text">${open ? o?.text : snippet(o?.text || '', 130)}</p>
    ${o && o.text.length > 130 ? html`<button type="button" class="linkbtn" onClick=${() => setOpen(!open)}>${open ? 'Thu gọn' : 'Đọc đầy đủ'}</button>` : null}
    <div class="scard__row">
      <div class="stack-s"><span class="label">Điểm Host</span>
        <${Stepper} big label=${`điểm phương án ${r.n + 1}`} value=${o?.score ?? 0} min=${0} max=${settings.maxScore} step=${settings.scoreStep} format=${fmtScore} onChange=${(v) => actions.setScore(r.key, v)} /></div>
      <div class="scard__meta">
        <span class="xs">Phiếu <${Tab} text=${String(r.votes)} /></span>
        ${o?.score == null ? html`<span class="chip chip--warn">Chưa chấm</span>` : null}
        ${o?.ai != null ? html`<button type="button" class="chip" onClick=${() => actions.setScore(r.key, o.ai)} aria-label=${`Dùng điểm AI gợi ý ${fmtScore(o.ai)}`}>AI gợi ý ${fmtScore(o.ai)}</button>` : null}
      </div>
    </div>
  </li>`;
}

export function ScoringControls({ ctx }) {
  const { settings, setSetting } = ctx;
  const preset = [5, 10, 20, 100].includes(settings.maxScore) ? settings.maxScore : 'custom';
  const askMax = async () => {
    const ok = (x) => { const n = Number(String(x).replace(',', '.')); return n >= 1 && n <= 1000; };
    const v = await inputDialog({ title: 'Điểm tối đa', label: 'Nhập số từ 1 đến 1000', value: String(settings.maxScore), confirmLabel: 'Đặt', validate: (x) => (ok(x) ? '' : 'Nhập số từ 1 đến 1000.') });
    if (v != null) setSetting('maxScore', v);
  };
  return html`<div class="stack">
    <div class="stack-s"><span class="label">Điểm tối đa</span>
      <${Seg} label="Điểm tối đa" value=${preset} onChange=${(v) => (v === 'custom' ? askMax() : setSetting('maxScore', v))} options=${[[5, '5'], [10, '10'], [20, '20'], [100, '100'], ['custom', preset === 'custom' ? String(settings.maxScore) : 'Khác']]} /></div>
    <div class="stack-s"><span class="label">Bước chấm</span><${Seg} label="Bước chấm" value=${settings.scoreStep} onChange=${(v) => setSetting('scoreStep', v)} options=${[[0.5, '0,5'], [1, '1']]} /></div>
    <div class="stack-s"><span class="label">Công thức</span>
      <${Seg} label="Công thức" value=${settings.formula} onChange=${(v) => setSetting('formula', v)} options=${[['host', 'Điểm Host'], ['mix', 'Host + phiếu'], ['votes', 'Chỉ phiếu']]} /></div>
    ${settings.formula === 'mix' ? html`<div class="row row--nowrap"><span class="label grow">Phiếu chiếm</span><${Stepper} label="tỉ lệ phiếu" value=${settings.voteWeight} min=${0} max=${100} step=${10} format=${(v) => `${v}%`} onChange=${(v) => setSetting('voteWeight', v)} /></div>` : null}
    <div class="stack-s"><span class="label">Vinh danh</span><${Seg} label="Vinh danh" value=${settings.awardTop} onChange=${(v) => setSetting('awardTop', v)} options=${[[1, 'Top 1'], [3, 'Top 3']]} /></div>
    <div class="stack-s"><span class="label">Điểm cộng cho tổ</span>
      <${Seg} label="Điểm cộng cho tổ" value=${settings.teamAward} onChange=${(v) => setSetting('teamAward', v)} options=${[['sum', 'Tổng điểm'], ['place', `Hạng ${PLACE_POINTS.join('-')}`]]} />
      <p class="help">${settings.teamAward === 'sum' ? 'Mỗi phương án được chiếu mang điểm tổng của nó về cho tổ và cho bạn viết.' : `Chỉ phương án trong top ${settings.awardTop} được cộng điểm hạng ${PLACE_POINTS.slice(0, settings.awardTop).join(', ')}.`}</p></div>
  </div>`;
}

export function ScoringPanel({ ctx }) {
  const { ranked, options } = ctx;
  return html`<div class="stack">
    <details class="card preview"><summary>Cách tính điểm</summary><${ScoringControls} ctx=${ctx} /></details>
    ${options.length ? html`<ul class="list scorelist">${ranked.map((r) => html`<${ScoreCard} key=${r.key} r=${r} ctx=${ctx} />`)}</ul>` : html`<${Empty}>Chưa có phương án nào.<//>`}
  </div>`;
}

/* ------------------------------------------------------------------ reveal */
export function RevealPanel({ ctx }) {
  const { pub, awards, round, settings } = ctx;
  const rv = pub.reveal;
  const award = awards[round];
  if (!rv) return html`<${Empty}>Chưa công bố.<//>`;
  const items = Object.values(rv.items || {}).sort((a, b) => a.rank - b.rank);
  return html`<${Section} title="Kết quả vòng này">
    <ul class="list">${items.map((it) => html`<li key=${it.uid || it.n} class=${`rrow ${it.honoured ? 'is-top' : ''}`}>
      <span class="rankbadge"><${Tab} text=${String(it.rank)} /></span>
      <div class="grow"><div class="strong">${it.name}</div><div class="row"><${TeamChip} id=${it.team} teams=${settings.teams} /><span class="xs muted">Phương án ${it.n + 1} · <${Tab} text=${fmtScore(it.value)} /> điểm · ${it.votes} phiếu</span></div></div>
      <span class="strong">+<${Tab} text=${fmtScore(it.points)} /></span></li>`)}</ul>
    ${award ? html`<div class="row">${Object.entries(award.teams || {}).map(([t, pts]) => html`<span key=${t} class=${`chip team team--${t}`}>${settings.teams[t]?.name || t} +${fmtScore(pts)}</span>`)}</div>` : html`<p class="help">Đang ghi điểm…</p>`}
  <//>`;
}

/* ------------------------------------------------------------------ leaderboard */
export function LeaderboardPanel({ ctx }) {
  const { board, settings, adjust, players, actions } = ctx;
  const teams = teamList(settings.teams);
  const rows = rankBoard(board.t, teams.map((t) => t.id));
  const prows = rankBoard(board.p).slice(0, 8);
  const log = Object.entries(adjust).map(([k, a]) => ({ k, ...a })).sort((a, b) => (b.at || 0) - (a.at || 0));
  const [note, setNote] = useState('');
  const bump = async (team, d) => { await actions.adjust(team, d, note.trim()); };
  const askNote = async () => { const v = await inputDialog({ title: 'Lý do điều chỉnh (không bắt buộc)', label: 'Ghi chú', value: note, confirmLabel: 'Lưu', maxLength: 80 }); if (v != null) setNote(v.trim()); };
  return html`<div class="stack">
    <${Section} title="Bảng điểm các tổ">
      <ul class="list">${rows.map((r) => {
        const t = teams.find((x) => x.id === r.id);
        return html`<li key=${r.id} class="lrow">
          <span class="rankbadge"><${Tab} text=${String(r.rank)} /></span>
          <span class=${`chip team team--${r.id} grow`}>${t?.name}</span>
          <span class="strong lrow__pts"><${Tab} text=${fmtScore(r.points)} /></span>
          <${Btn} small class="btn--icon" aria-label=${`Trừ 1 điểm ${t?.name}`} icon="minus" onClick=${() => bump(r.id, -1)} />
          <${Btn} small class="btn--icon" aria-label=${`Cộng 1 điểm ${t?.name}`} icon="plus" onClick=${() => bump(r.id, 1)} /></li>`;
      })}</ul>
      <div class="row"><${Btn} small icon="edit" onClick=${askNote}>${note ? `Lý do: ${note}` : 'Thêm lý do cho lần điều chỉnh'}<//></div>
    <//>
    <${Section} title="Nhật ký điều chỉnh">
      ${log.length ? html`<ul class="list loglist">${log.map((e) => html`<li key=${e.k} class="logrow"><span class="chip team team--${e.team}">${settings.teams[e.team]?.name || e.team}</span>
        <span class="strong">${e.delta > 0 ? '+' : ''}${fmtScore(e.delta)}</span><span class="grow xs muted">${e.note || 'Điều chỉnh thủ công'}</span>
        <span class="xs muted"><${Tab} text=${new Date(e.at || 0).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} /></span></li>`)}</ul>` : html`<${Empty}>Chưa có điều chỉnh nào.<//>`}
    <//>
    <${Section} title="Cá nhân (top 8)">
      ${prows.length ? html`<ol class="list">${prows.map((r) => html`<li key=${r.id} class="lrow"><span class="rankbadge"><${Tab} text=${String(r.rank)} /></span>
        <span class="grow strong">${players[r.id]?.name || 'Đã rời phòng'}</span><span class="strong"><${Tab} text=${fmtScore(r.points)} /></span></li>`)}</ol>` : html`<${Empty}>Chưa có điểm cá nhân.<//>`}
    <//>
  </div>`;
}
