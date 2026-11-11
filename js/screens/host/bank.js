import { useState } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Tab, Sheet, Field, toast, confirmDialog } from '../../ui.js';
import * as fb from '../../fb.js';
import { rp } from '../../lib/room-ops.js';
import { store, K } from '../../lib/storage.js';
import { normalizeBank, addQuestion, updateQuestion, deleteQuestion, duplicateQuestion, moveQuestion, exportBank, importBank, LIMITS, defaultBank } from '../../lib/bank.js';
import { saveText } from '../../lib/download.js';

const ERR = {
  title: 'Nhập tiêu đề.', titleLong: `Tiêu đề tối đa ${LIMITS.title} ký tự.`, textShort: `Nội dung tình huống cần ít nhất ${LIMITS.textMin} ký tự.`, textLong: `Nội dung tối đa ${LIMITS.textMax} ký tự.`,
  criteriaMany: `Tối đa ${LIMITS.criteria} tiêu chí.`, criterionLong: `Mỗi tiêu chí tối đa ${LIMITS.criterion} ký tự.`, time: 'Thời gian từ 10 giây đến 60 phút.', full: 'Ngân hàng đã đầy.', missing: 'Không tìm thấy câu hỏi.',
};

/** Atomic edit of the bank in the room (transaction), mirrored to this device's localStorage. */
export async function mutateBank(code, fn) {
  let failure = null;
  let extra = null;
  const res = await fb.transact(rp(code, 'private/bank'), (cur) => {
    failure = null;
    const r = fn(normalizeBank(cur));
    if (!r.ok) { failure = r; return undefined; }
    extra = r;
    return r.bank;
  });
  if (failure) return failure;
  const bank = normalizeBank(res.snapshot.val());
  store.setJSON(K.bank, bank);
  return { ok: true, bank, ...extra };
}

function Editor({ q, onSave, onCancel }) {
  const [t, setT] = useState({ title: q.title || '', text: q.text || '', criteria: (q.criteria || []).join('\n'), time: String(q.time || 120) });
  const [errs, setErrs] = useState([]);
  const set = (k) => (e) => { setT({ ...t, [k]: e.target.value }); setErrs([]); };
  const submit = async (e) => {
    e.preventDefault();
    const r = await onSave({ title: t.title, text: t.text, criteria: t.criteria.split('\n'), time: Number(t.time) });
    if (r && !r.ok) setErrs(r.errors || ['missing']);
  };
  return html`<form class="card stack" onSubmit=${submit}>
    <h3>${q.id ? 'Sửa câu hỏi' : 'Thêm câu hỏi'}</h3>
    <${Field} label="Tiêu đề"><input class="input" value=${t.title} maxLength="80" onInput=${set('title')} /><//>
    <${Field} label="Nội dung tình huống" help="Kết thúc bằng một câu hỏi rõ ràng."><textarea class="textarea" rows="8" value=${t.text} onInput=${set('text')}></textarea><//>
    <${Field} label="Tiêu chí chấm (mỗi dòng một tiêu chí, không bắt buộc)" help="Chỉ Host thấy. Có thể kèm vào prompt cho AI."><textarea class="textarea" rows="4" value=${t.criteria} onInput=${set('criteria')}></textarea><//>
    <${Field} label="Thời gian mặc định (giây)"><input class="input" inputmode="numeric" value=${t.time} onInput=${(e) => { setT({ ...t, time: e.target.value.replace(/\D/g, '') }); setErrs([]); }} /><//>
    ${errs.length ? html`<div class="error" role="alert"><${Icon} name="alert" /><div class="stack-s">${errs.map((c) => html`<span key=${c}>${ERR[c] || c}</span>`)}</div></div>` : null}
    <div class="row"><${Btn} class="grow" onClick=${onCancel}>Huỷ<//><button type="submit" class="btn btn--primary grow">Lưu</button></div>
  </form>`;
}

export function BankSheet({ ctx, onClose }) {
  const { code, bank } = ctx;
  const list = bank.length ? bank : defaultBank();
  const [edit, setEdit] = useState(null); // null | {} (new) | question
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const run = async (fn, okMsg) => { const r = await mutateBank(code, fn); if (!r.ok) toast(ERR[r.errors?.[0]] || 'Không lưu được.', 'error'); else if (okMsg) toast(okMsg); return r; };

  const save = async (v) => {
    const r = await mutateBank(code, (b) => (edit.id ? updateQuestion(b, edit.id, v) : addQuestion(b, v)));
    if (r.ok) { setEdit(null); toast('Đã lưu câu hỏi.'); }
    return r;
  };
  const del = async (q) => {
    if (list.length <= 1) { toast('Cần giữ lại ít nhất một câu hỏi.', 'error'); return; }
    const ok = await confirmDialog({ title: `Xoá "${q.title}"?`, body: 'Không khôi phục được (trừ khi bạn đã xuất file).', confirmLabel: 'Xoá', danger: true });
    if (ok) run((b) => deleteQuestion(b, q.id), 'Đã xoá.');
  };
  const doImport = async (text, mode) => {
    if (mode === 'replace') {
      const ok = await confirmDialog({ title: 'Thay toàn bộ ngân hàng?', body: 'Các câu hỏi hiện có sẽ bị thay bằng file.', confirmLabel: 'Thay thế', danger: true });
      if (!ok) return;
    }
    const probe = importBank(text, list, { mode });
    if (!probe.ok) { toast(probe.error === 'json' ? 'File không phải JSON hợp lệ.' : probe.error === 'shape' ? 'File không đúng định dạng ngân hàng câu hỏi.' : 'Không có câu hỏi hợp lệ trong file.', 'error'); return; }
    const r = await run((b) => importBank(text, b, { mode }), `Đã thêm ${probe.added} câu hỏi${probe.skipped ? `, bỏ qua ${probe.skipped}` : ''}.`);
    if (r.ok) { setPaste(''); setShowPaste(false); }
  };
  const onFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => doImport(String(rd.result), 'merge');
    rd.onerror = () => toast('Không đọc được file.', 'error');
    rd.readAsText(f, 'utf-8');
  };
  const doExport = async () => {
    const r = await saveText(`ngan-hang-cau-hoi-${code}.json`, exportBank(list), 'application/json');
    toast(r === 'download' ? 'Đã tải file ngân hàng câu hỏi.' : r === 'copied' ? 'Trình duyệt chặn tải xuống nên đã sao chép nội dung.' : 'Không xuất được.', r === 'failed' ? 'error' : '');
  };

  return html`<${Sheet} title="Ngân hàng câu hỏi" onClose=${onClose} wide>
    ${edit ? html`<${Editor} key=${edit.id || 'new'} q=${edit} onSave=${save} onCancel=${() => setEdit(null)} />` : html`<div class="stack">
      <div class="row"><${Btn} kind="primary" icon="plus" onClick=${() => setEdit({})}>Thêm câu hỏi<//>
        <${Btn} small icon="download" onClick=${doExport}>Xuất JSON<//>
        <label class="btn btn--small filebtn"><${Icon} name="upload" />Nhập file<input type="file" accept="application/json,.json" onChange=${onFile} /></label>
        <${Btn} small icon="copy" onClick=${() => setShowPaste(!showPaste)}>Dán JSON<//></div>
      ${showPaste ? html`<div class="stack-s"><textarea class="textarea" rows="5" value=${paste} placeholder="Dán nội dung file JSON" onInput=${(e) => setPaste(e.target.value)}></textarea>
        <div class="row"><${Btn} small disabled=${!paste.trim()} onClick=${() => doImport(paste, 'merge')}>Thêm vào ngân hàng<//><${Btn} small class="btn--danger" disabled=${!paste.trim()} onClick=${() => doImport(paste, 'replace')}>Thay thế toàn bộ<//></div></div>` : null}
      <p class="help">Ngân hàng được lưu trong phòng và một bản trên thiết bị này.</p>
      <ul class="list banklist">${list.map((q, i) => html`<li key=${q.id} class="bankrow">
        <div class="row spread"><span class="strong"><${Tab} text=${String(i + 1)} />. ${q.title}</span><span class="xs muted"><${Tab} text=${`${q.time}s`} /></span></div>
        <details class="preview"><summary>Xem nội dung</summary><p class="qtext">${q.text}</p>${q.criteria.length ? html`<ul class="criteria">${q.criteria.map((c, j) => html`<li key=${j}>${c}</li>`)}</ul>` : null}</details>
        <div class="row">
          <${Btn} small class="btn--icon" aria-label="Đưa lên" icon="up" disabled=${i === 0} onClick=${() => run((b) => moveQuestion(b, q.id, -1))} />
          <${Btn} small class="btn--icon" aria-label="Đưa xuống" icon="down" disabled=${i === list.length - 1} onClick=${() => run((b) => moveQuestion(b, q.id, 1))} />
          <${Btn} small icon="edit" onClick=${() => setEdit(q)}>Sửa<//>
          <${Btn} small icon="copy-plus" onClick=${() => run((b) => duplicateQuestion(b, q.id), 'Đã nhân bản.')}>Nhân bản<//>
          <${Btn} small class="btn--icon" aria-label=${`Xoá ${q.title}`} icon="trash" onClick=${() => del(q)} />
        </div></li>`)}</ul></div>`}
  <//>`;
}
