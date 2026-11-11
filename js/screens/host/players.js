import { useMemo } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Tab, toast, confirmDialog, inputDialog } from '../../ui.js';
import * as fb from '../../fb.js';
import { teamList } from '../../lib/teams.js';
import { kickUpdates, renamePlayerUpdates, movePlayerUpdates, repUpdates } from '../../lib/room-ops.js';
import { validateName } from '../../lib/validate.js';
import { Toggle } from './common.js';

export function PlayersPanel({ ctx }) {
  const { code, pub, players, presence, reps, submitted, settings, write, setSetting } = ctx;
  const teams = teamList(settings.teams);
  const byTeam = useMemo(() => {
    const m = {};
    Object.entries(players).forEach(([uid, p]) => { (m[p.team] ||= []).push({ uid, ...p }); });
    Object.values(m).forEach((a) => a.sort((x, y) => (x.joinedAt || 0) - (y.joinedAt || 0)));
    return m;
  }, [players]);
  const total = Object.keys(players).length;
  const online = Object.keys(players).filter((u) => presence[u]).length;

  const kick = async (p) => {
    const ok = await confirmDialog({ title: `Mời ${p.name} ra khỏi phòng?`, body: 'Bạn ấy sẽ không vào lại được phòng này.', confirmLabel: 'Mời ra', danger: true });
    if (!ok) return;
    if (await write(kickUpdates({ code, uid: p.uid, teamId: p.team, repUid: reps[p.team] }))) toast(`Đã mời ${p.name} ra khỏi phòng`);
  };
  const rename = async (p) => {
    const others = Object.entries(players).filter(([u]) => u !== p.uid).map(([, x]) => x.name.toLowerCase());
    const v = await inputDialog({
      title: 'Đổi tên', label: 'Tên mới (2-24 ký tự)', value: p.name, confirmLabel: 'Lưu', maxLength: 40,
      validate: (x) => { const r = validateName(x, { extra: settings.badWords }); return !r.ok ? 'Tên chưa hợp lệ.' : others.includes(r.value.toLowerCase()) ? 'Tên này đã có người dùng.' : ''; },
    });
    if (v == null) return;
    const r = validateName(v, { extra: settings.badWords });
    if (r.ok) await write(renamePlayerUpdates({ code, uid: p.uid, name: r.value }));
  };
  const move = (p, team) => write(movePlayerUpdates({ code, uid: p.uid, team, repOf: reps[p.team] === p.uid ? p.team : null }));
  const setRep = (p) => write(repUpdates({ code, teamId: p.team, uid: reps[p.team] === p.uid ? null : p.uid }));

  return html`<div class="stack">
    <div class="row spread"><h3>Người chơi</h3><span class="strong"><${Tab} text=${`${online}/${total}`} /></span></div>
    <${Toggle} label="Khoá phòng, không cho vào thêm" on=${settings.lockJoin} onChange=${(v) => setSetting('lockJoin', v)} />
    ${total === 0 ? html`<p class="muted">Chưa có ai vào phòng.</p>` : null}
    ${teams.map((t) => {
      const ps = byTeam[t.id] || [];
      return html`<section key=${t.id} class="stack-s">
        <div class=${`chip team team--${t.id}`} style="justify-content:space-between"><span>${t.name}</span><span><${Tab} text=${String(ps.length)} /></span></div>
        <ul class="list">${ps.map((p) => html`<li key=${p.uid} class="plrow2">
          <div class="plrow">
            <span class=${`dot ${presence[p.uid] ? 'dot--on' : 'dot--off'}`} title=${presence[p.uid] ? 'Đang trực tuyến' : 'Ngoại tuyến'}></span>
            <span class="grow plrow__name">${p.name}${reps[t.id] === p.uid ? html` <span class="chip">Đại diện</span>` : null}</span>
            ${submitted[p.uid] ? html`<span class="chip"><${Icon} name="check" />Đã nộp</span>` : null}
          </div>
          <div class="plrow__act">
            <select class="select select--small" aria-label=${`Chuyển ${p.name} sang tổ khác`} value=${p.team} onChange=${(e) => move(p, e.target.value)}>${teams.map((x) => html`<option key=${x.id} value=${x.id}>${x.name}</option>`)}</select>
            ${settings.mode === 'team' ? html`<${Btn} small icon="flag" aria-pressed=${reps[t.id] === p.uid} onClick=${() => setRep(p)}>${reps[t.id] === p.uid ? 'Bỏ đại diện' : 'Làm đại diện'}<//>` : null}
            <${Btn} small class="btn--icon" aria-label=${`Đổi tên ${p.name}`} icon="edit" onClick=${() => rename(p)} />
            <${Btn} small class="btn--icon" aria-label=${`Mời ${p.name} ra khỏi phòng`} icon="user-x" onClick=${() => kick(p)} />
          </div>
        </li>`)}</ul></section>`;
    })}
  </div>`;
}
