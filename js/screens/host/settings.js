import { useState } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Tab, Sheet, Field, Stepper, toast, confirmDialog } from '../../ui.js';
import * as fb from '../../fb.js';
import { store, K } from '../../lib/storage.js';
import { teamList } from '../../lib/teams.js';
import { rp, teamsUpdates, badWordsUpdate, endRoomUpdates } from '../../lib/room-ops.js';
import { resizeTeams, cleanBadWords, fixLimits, TEAM_NAME_MAX } from '../../lib/settings.js';
import { rankBoard } from '../../lib/scoring.js';
import { resultsCsv, boardCsv, resultsJson, fileStamp } from '../../lib/exporter.js';
import { saveText } from '../../lib/download.js';
import { canFullscreen } from '../../lib/device.js';
import { toggleFullscreen, fullscreenElement } from '../../lib/viewport.js';
import { forgetHostRoom } from '../../room.js';
import { PRESETS_S } from '../../lib/timer.js';
import { Share } from './share.js';
import { Seg, Toggle } from './common.js';
import { ScoringControls } from './flow.js';

function Group({ title, children, open }) {
  return html`<details class="card sgroup" open=${open}><summary><h3>${title}</h3><${Icon} name="down" /></summary><div class="stack sgroup__body">${children}</div></details>`;
}
const Row = ({ label, children }) => html`<div class="row row--nowrap srow"><span class="label grow">${label}</span>${children}</div>`;

function TeamNames({ ctx }) {
  const { code, settings, write } = ctx;
  return html`<div class="stack-s"><span class="label">Tên các tổ</span>${teamList(settings.teams).map((t) => html`<label key=${t.id} class="row row--nowrap">
    <span class=${`chip team team--${t.id}`} style="min-width:4.5em;justify-content:center">${t.id.slice(1)}</span>
    <input class="input" maxLength=${TEAM_NAME_MAX} aria-label=${`Tên tổ ${t.id.slice(1)}`} defaultValue=${t.name} key=${`${t.id}-${t.name}`}
      onBlur=${(e) => { const v = e.target.value.replace(/\s+/g, ' ').trim(); if (v && v !== t.name) write({ [rp(code, `public/settings/teams/${t.id}/name`)]: v.slice(0, TEAM_NAME_MAX) }); else e.target.value = t.name; }} /></label>`)}</div>`;
}

function BadWords({ ctx }) {
  const { code, settings, write } = ctx;
  const [v, setV] = useState('');
  const add = async () => {
    const next = cleanBadWords([...settings.badWords, v]);
    if (next.length === settings.badWords.length) { toast('Từ này đã có hoặc không hợp lệ.', 'error'); return; }
    if (await write(badWordsUpdate({ code, words: next }))) setV('');
  };
  return html`<div class="stack-s"><span class="label">Từ bị cấm thêm trong tên</span>
    <div class="row row--nowrap"><input class="input" value=${v} maxLength="30" placeholder="Thêm một từ hoặc cụm từ" aria-label="Thêm từ bị cấm" onInput=${(e) => setV(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && add()} />
      <${Btn} icon="plus" disabled=${!v.trim()} onClick=${add}>Thêm<//></div>
    ${settings.badWords.length ? html`<div class="row">${settings.badWords.map((w) => html`<button type="button" key=${w} class="chip chip--btn" aria-label=${`Bỏ từ ${w}`} onClick=${() => write(badWordsUpdate({ code, words: settings.badWords.filter((x) => x !== w) }))}>${w}<${Icon} name="x" /></button>`)}</div>` : html`<p class="help">Bộ lọc đã có sẵn từ thô tục tiếng Việt và tiếng Anh, kể cả viết không dấu, tách chữ hoặc đổi số.</p>`}</div>`;
}

export function SettingsSheet({ ctx, onClose }) {
  const { code, settings, setSetting, players, write, awards, adjust, board, pub, round } = ctx;
  const [showPin, setShowPin] = useState(false);
  const [wake, setWake] = useState(store.get(K.hostWake, '0') === '1');
  const [fs, setFs] = useState(!!fullscreenElement());
  const pin = store.get(K.pin(code));
  const teams = teamList(settings.teams);

  const setTeamCount = async (n) => {
    const { teams: next, moves } = resizeTeams(settings.teams, players, n);
    const removed = Object.keys(settings.teams).filter((id) => !next[id]);
    if (moves.length) {
      const ok = await confirmDialog({ title: `Bỏ ${removed.length} tổ?`, body: `${moves.length} bạn đang ở các tổ này sẽ chuyển sang ${next.t1.name}.`, confirmLabel: 'Đồng ý' });
      if (!ok) return;
    }
    await write(teamsUpdates({ code, teams: next, moves, removed }));
  };
  const limits = (patch) => { const f = fixLimits({ minChars: settings.minChars, maxChars: settings.maxChars, ...patch }); setSetting('minChars', f.minChars); setSetting('maxChars', f.maxChars); };

  const save = async (name, text, mime) => {
    const r = await saveText(name, text, mime);
    toast(r === 'download' ? 'Đã tải xuống.' : r === 'copied' ? 'Trình duyệt chặn tải xuống nên đã sao chép nội dung.' : 'Không xuất được.', r === 'failed' ? 'error' : '');
  };
  const nameOf = (u) => players[u]?.name || 'Đã rời phòng';
  const exportResults = () => save(`ket-qua-${code}-${fileStamp()}.csv`, resultsCsv(awards, settings.teams), 'text/csv;charset=utf-8');
  const exportBoard = () => save(`bang-diem-${code}-${fileStamp()}.csv`, boardCsv({
    teamRows: rankBoard(board.t, teams.map((t) => t.id)).map((r) => ({ ...r, name: settings.teams[r.id]?.name || r.id })),
    playerRows: rankBoard(board.p).map((r) => ({ ...r, name: nameOf(r.id), team: settings.teams[players[r.id]?.team]?.name || '' })),
  }), 'text/csv;charset=utf-8');
  const exportJson = () => save(`xu-ly-tinh-huong-${code}-${fileStamp()}.json`, resultsJson({ code, settings, awards, adjustments: adjust, board: pub.board, exportedAt: new Date().toISOString() }), 'application/json');
  const reset = async () => {
    const ok = await confirmDialog({ title: 'Xoá toàn bộ điểm?', body: 'Điểm các vòng và nhật ký điều chỉnh sẽ bị xoá. Bài nộp vẫn được giữ.', confirmLabel: 'Xoá điểm', danger: true });
    if (ok) { await ctx.actions.resetPoints(); toast('Đã xoá điểm.'); }
  };
  const endRoom = async () => {
    const ok = await confirmDialog({ title: 'Kết thúc và xoá phòng?', body: 'Toàn bộ bài nộp và dữ liệu của phòng sẽ bị xoá, không khôi phục được.', confirmLabel: 'Xoá phòng', danger: true });
    if (!ok) return;
    try { await fb.update(endRoomUpdates({ code })); forgetHostRoom(code); location.hash = '#/'; }
    catch (e) { toast(fb.describeError(e).text, 'error'); }
  };

  return html`<${Sheet} title="Cài đặt" onClose=${onClose} wide>
    <div class="stack settings">
      <${Group} title="Phòng" open>
        <${Share} code=${code} />
        <${Row} label="Cách nộp bài"><${Seg} label="Cách nộp bài" value=${settings.mode} onChange=${(v) => setSetting('mode', v)} options=${[['all', 'Cả lớp'], ['team', 'Đại diện tổ']]} /><//>
        <${Row} label="Số tổ"><${Stepper} label="số tổ" value=${teams.length} min=${2} max=${6} onChange=${setTeamCount} /><//>
        <${TeamNames} ctx=${ctx} />
        <${Toggle} label="Khoá phòng, không cho vào thêm" on=${settings.lockJoin} onChange=${(v) => setSetting('lockJoin', v)} />
        <${BadWords} ctx=${ctx} />
        <div class="row row--nowrap"><span class="label">PIN Host</span>${pin ? html`<span class="strong"><${Tab} text=${showPin ? pin : '••••••'} /></span><${Btn} small class="btn--icon" aria-label=${showPin ? 'Ẩn PIN' : 'Hiện PIN'} icon=${showPin ? 'eye-off' : 'eye'} onClick=${() => setShowPin(!showPin)} />` : html`<span class="help">Không lưu trên thiết bị này</span>`}</div>
      <//>
      <${Group} title="Thời gian">
        <${Row} label="Thời gian mặc định"><${Seg} label="Thời gian mặc định" value=${settings.defaultSecs} onChange=${(v) => setSetting('defaultSecs', v)} options=${PRESETS_S.map((s) => [s, `${s}s`])} /><//>
        <${Row} label="Mỗi lần cộng thêm"><${Seg} label="Mỗi lần cộng thêm" value=${settings.addMs} onChange=${(v) => setSetting('addMs', v)} options=${[[15000, '15s'], [30000, '30s'], [60000, '60s']]} /><//>
        <p class="help">Thời gian riêng của từng câu hỏi đặt trong Ngân hàng câu hỏi.</p>
      <//>
      <${Group} title="Bài nộp">
        <${Row} label="Tối thiểu (ký tự)"><${Stepper} label="số ký tự tối thiểu" value=${settings.minChars} min=${1} max=${Math.min(1000, settings.maxChars)} step=${5} onChange=${(v) => limits({ minChars: v })} /><//>
        <${Row} label="Tối đa (ký tự)"><${Stepper} label="số ký tự tối đa" value=${settings.maxChars} min=${Math.max(20, settings.minChars)} max=${2000} step=${50} onChange=${(v) => limits({ maxChars: v })} /><//>
        <${Toggle} label="Cho sửa bài đến khi khoá" on=${settings.allowEdit} onChange=${(v) => setSetting('allowEdit', v)} />
        <${Toggle} label="Tự nộp bản nháp khi hết giờ" on=${settings.autoSubmit} onChange=${(v) => setSetting('autoSubmit', v)} />
        <${Row} label="Thời gian ân hạn"><${Seg} label="Thời gian ân hạn" value=${settings.graceMs} onChange=${(v) => setSetting('graceMs', v)} options=${[[0, '0'], [1000, '1s'], [3000, '3s'], [5000, '5s'], [10000, '10s']]} /><//>
      <//>
      <${Group} title="AI">
        <${Row} label="AI chọn bao nhiêu bài"><${Stepper} label="số bài AI chọn" value=${settings.aiN} min=${1} max=${12} onChange=${(v) => setSetting('aiN', v)} /><//>
        <${Toggle} label="Ẩn tên khi xuất" help="Bỏ tên và tổ khỏi prompt." on=${settings.aiHideNames} onChange=${(v) => setSetting('aiHideNames', v)} />
        <${Toggle} label="Kèm tiêu chí chấm vào prompt" on=${settings.aiCriteria} onChange=${(v) => setSetting('aiCriteria', v)} />
      <//>
      <${Group} title="Bình chọn">
        <${Toggle} label="Cho bình chọn trên điện thoại" help="Mỗi bạn một phiếu, không bầu cho bài của mình hoặc của tổ mình khi nộp theo đại diện tổ." on=${settings.phoneVoting} onChange=${(v) => setSetting('phoneVoting', v)} />
        <${Toggle} label="Hiện kết quả trực tiếp trên TV" on=${settings.liveTally} onChange=${(v) => setSetting('liveTally', v)} />
        <p class="help">Giơ tay luôn dùng được: nhập số tay cho từng phương án ở bước bình chọn.</p>
      <//>
      <${Group} title="Chấm điểm"><${ScoringControls} ctx=${ctx} /><//>
      <${Group} title="TV">
        <${Row} label="Nền"><${Seg} label="Nền TV" value=${settings.tvTheme} onChange=${(v) => setSetting('tvTheme', v)} options=${[['light', 'Sáng'], ['dark', 'Tối']]} /><//>
        <${Row} label="Cỡ chữ"><${Seg} label="Cỡ chữ TV" value=${settings.tvSize} onChange=${(v) => setSetting('tvSize', v)} options=${['S', 'M', 'L', 'XL'].map((s) => [s, s])} /><//>
        <${Toggle} label="Âm báo 10 giây cuối" help="Cần chạm vào màn hình TV một lần để trình duyệt cho phép phát âm." on=${settings.tvSound} onChange=${(v) => setSetting('tvSound', v)} />
        <${Toggle} label="Mã QR nhỏ ở góc khi đang làm bài" on=${settings.tvQr} onChange=${(v) => setSetting('tvQr', v)} />
      <//>
      <${Group} title="Thiết bị">
        ${canFullscreen(document) ? html`<${Btn} icon=${fs ? 'minimize' : 'maximize'} onClick=${async () => { await toggleFullscreen(); setFs(!!fullscreenElement()); }}>${fs ? 'Thoát toàn màn hình' : 'Toàn màn hình'}<//>` : html`<p class="help">Trên iPhone, mở bằng Safari hoặc thêm vào Màn hình chính để có toàn màn hình.</p>`}
        <${Toggle} label="Giữ màn hình luôn sáng (thiết bị Host)" on=${wake} onChange=${(v) => { setWake(v); store.set(K.hostWake, v ? '1' : '0'); }} />
      <//>
      <${Group} title="Dữ liệu">
        <div class="row">
          <${Btn} icon="download" onClick=${exportResults}>CSV kết quả theo vòng<//>
          <${Btn} icon="download" onClick=${exportBoard}>CSV bảng điểm<//>
          <${Btn} icon="download" onClick=${exportJson}>Xuất JSON<//>
        </div>
        <p class="help">File CSV dùng UTF-8 có BOM nên Excel đọc đúng tiếng Việt.</p>
        <${Btn} class="btn--danger" icon="trash" onClick=${reset}>Xoá toàn bộ điểm<//>
        <${Btn} class="btn--danger" icon="trash" onClick=${endRoom}>Kết thúc và xoá phòng<//>
      <//>
    </div>
  <//>`;
}
