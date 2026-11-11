// Player (phone) views for the stage-2 phases.
import { useState } from '../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Tab, TeamChip, toast } from '../ui.js';
import * as fb from '../fb.js';
import { useDb } from '../hooks.js';
import { rp } from '../lib/room-ops.js';
import { asArray } from '../lib/options.js';
import { teamList } from '../lib/teams.js';
import { rankBoard } from '../lib/scoring.js';

const Wait = ({ title, children }) => html`<div class="center stack"><div class="card stack" style="text-align:center"><h2>${title}</h2>${children}</div></div>`;
const hlOf = (it) => (it.hl ? html`<p class="pv__hl strong">${it.hl}</p>` : null);

export function PlayerReviewing() {
  return html`<${Wait} title="Host đang chấm"><p class="muted">Nhìn lên màn hình lớp để theo dõi các phương án được chọn.</p><//>`;
}

export function PlayerShowcase({ pub }) {
  const items = asArray(pub.showcase?.items);
  return html`<div class="pv">
    <h2>Các phương án được chọn</h2>
    <p class="muted">Tên người viết sẽ được công bố sau.</p>
    ${items.map((it, i) => html`<article key=${i} class="card card--flat pv__opt"><span class="chip chip--no">Phương án <${Tab} text=${String(i + 1)} /></span>${hlOf(it)}<p class="qtext">${it.text}</p></article>`)}
  </div>`;
}

export function PlayerVoting({ code, uid, pub }) {
  const items = asArray(pub.showcase?.items);
  const vote = pub.vote || {};
  const mine = useDb(`rooms/${code}/votes/${pub.roundId}/${uid}`);
  const [blocked, setBlocked] = useState(() => new Set());
  const [busy, setBusy] = useState(null);
  const cast = async (i) => {
    setBusy(i);
    try { await fb.set(rp(code, `votes/${pub.roundId}/${uid}`), i); }
    catch {
      setBlocked((s) => new Set([...s, i]));
      toast('Bạn không bình chọn được cho bài của mình hoặc của tổ mình.', 'error');
    } finally { setBusy(null); }
  };
  const chosen = typeof mine.value === 'number' ? mine.value : null;
  const open = vote.open === true;
  return html`<div class="pv">
    <h2>${open ? 'Bình chọn' : 'Đọc kỹ các phương án'}</h2>
    <p class=${open ? 'strong' : 'muted'}>${open ? (chosen != null ? `Bạn đã chọn Phương án ${chosen + 1}. Bạn có thể đổi trước khi Host đóng bình chọn.` : 'Mỗi bạn một phiếu. Không bầu cho bài của mình hoặc của tổ mình.') : 'Bình chọn trên điện thoại đang đóng. Hãy giơ tay theo hướng dẫn của Host.'}</p>
    ${items.map((it, i) => html`<article key=${i} class=${`card card--flat pv__opt ${chosen === i ? 'pv__me' : ''}`}>
      <span class="chip chip--no">Phương án <${Tab} text=${String(i + 1)} /></span>${hlOf(it)}<p class="qtext">${it.text}</p>
      ${open ? html`<div class="pv__vote"><${Btn} kind=${chosen === i ? 'primary' : ''} icon=${chosen === i ? 'check' : 'hand'} aria-pressed=${chosen === i} disabled=${busy != null || blocked.has(i)} onClick=${() => cast(i)}>${blocked.has(i) ? 'Bài của bạn hoặc tổ bạn' : chosen === i ? 'Đã chọn' : 'Chọn phương án này'}<//></div>` : null}
    </article>`)}
  </div>`;
}

export function PlayerScoring() {
  return html`<${Wait} title="Đang tính điểm"><p class="muted">Sắp công bố người thắng.</p><//>`;
}

export function PlayerReveal({ pub, uid, me, teams }) {
  const rv = pub.reveal;
  if (!rv) return html`<${PlayerScoring} />`;
  const all = Object.values(rv.items || {}).sort((a, b) => a.rank - b.rank);
  const mineItem = all.find((x) => x.uid === uid);
  const teamItem = all.find((x) => x.team === me.team);
  return html`<div class="pv">
    <h2>Kết quả vòng này</h2>
    ${mineItem ? html`<div class="card pv__me stack-s"><span class="label">Bài của bạn</span><p class="strong">Hạng ${mineItem.rank}${mineItem.honoured ? ', được vinh danh' : ''}: ${mineItem.value} điểm${mineItem.points ? `, cộng ${mineItem.points}` : ''}.</p></div>`
      : teamItem ? html`<div class="card stack-s"><span class="label">Tổ của bạn</span><p class="strong">Phương án của tổ đạt hạng ${teamItem.rank}: ${teamItem.value} điểm.</p></div>`
      : html`<div class="card card--flat"><p>Bài của bạn chưa nằm trong các phương án được chọn lần này. Cố lên vòng sau nhé.</p></div>`}
    <ul class="list">${all.map((it) => html`<li key=${it.n} class="rrow ${it.honoured ? 'is-top' : ''}"><span class="rankbadge"><${Tab} text=${String(it.rank)} /></span>
      <div class="grow"><div class="strong">${it.name}</div><div class="row"><${TeamChip} id=${it.team} teams=${teams} /><span class="xs muted">Phương án ${it.n + 1} · ${it.value} điểm</span></div></div></li>`)}</ul>
  </div>`;
}

export function PlayerLeaderboard({ pub, uid, me, teams, players }) {
  const board = pub.board || {};
  const tl = teamList(teams);
  const trows = rankBoard(board.t, tl.map((t) => t.id));
  const prows = rankBoard(board.p).filter((r) => players[r.id]);
  const myRank = prows.find((r) => r.id === uid);
  const top = Math.max(1, ...trows.map((r) => r.points));
  return html`<div class="pv">
    <h2>Bảng điểm</h2>
    <ul class="list">${trows.map((r) => html`<li key=${r.id} class=${`stack-s ${r.id === me.team ? 'pv__me' : ''}`}>
      <div class="row spread"><span class="row"><span class="rankbadge"><${Tab} text=${String(r.rank)} /></span><${TeamChip} id=${r.id} teams=${teams} /></span><span class="strong"><${Tab} text=${String(r.points)} /></span></div>
      <div class="pv__bar" aria-hidden="true"><i style=${{ width: `${Math.max(0, (r.points / top) * 100)}%` }}></i></div></li>`)}</ul>
    <div class="card card--flat stack-s"><span class="label">Cá nhân</span>
      ${myRank ? html`<p class="strong">Bạn đang hạng ${myRank.rank} với ${myRank.points} điểm.</p>` : html`<p>Bạn chưa có điểm cá nhân.</p>`}
      ${prows.slice(0, 5).map((r) => html`<div key=${r.id} class="kv"><span>${r.rank}. ${players[r.id]?.name}</span><span class="strong">${r.points}</span></div>`)}</div>
  </div>`;
}
