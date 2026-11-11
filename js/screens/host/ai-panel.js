import { useState, useEffect, useRef, useMemo } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, Tab, Sheet, SelectAllBox, copyText, toast, confirmDialog, Stepper } from '../../ui.js';
import * as fb from '../../fb.js';
import { useDebounced } from '../../hooks.js';
import { rp, aiImportUpdates } from '../../lib/room-ops.js';
import { assignIds, buildPrompt, exportPayload, parseAiResult, scriptPages } from '../../lib/ai.js';
import { looksLikeInjection } from '../../lib/answer-tools.js';
import { asArray } from '../../lib/options.js';
import { keepAwake } from '../../lib/viewport.js';
import { saveText } from '../../lib/download.js';
import { Toggle } from './common.js';

const AI_SITES = [['ChatGPT', 'https://chatgpt.com/'], ['Claude', 'https://claude.ai/new'], ['Gemini', 'https://gemini.google.com/app']];

/** Ids are assigned once per round (transaction, so two Hosts get the same numbers) and never change afterwards. */
export async function ensureIds(ctx) {
  const c = ctx.ref.current;
  const list = Object.entries(c.answers).filter(([uid]) => c.players[uid]).map(([uid, a]) => ({ uid, t0: a.t0 ?? a.ts ?? 0 }));
  if (!list.length || !c.round) return c.aid;
  const res = await fb.transact(rp(c.code, `private/aid/${c.round}`), (cur) => assignIds(list, cur || {}));
  return res.snapshot.val() || {};
}

export function buildExport(ctx, aid) {
  const { pub, settings, players, answers, criteria } = ctx.ref.current;
  const teamName = (id) => settings.teams?.[id]?.name || id;
  const items = Object.entries(answers).filter(([uid]) => players[uid] && aid[uid]).map(([uid, a]) => ({ id: aid[uid], name: players[uid].name, team: teamName(players[uid].team), text: a.text }));
  const prompt = buildPrompt({ question: pub.question, criteria, items, n: settings.aiN, maxScore: settings.maxScore, step: settings.scoreStep, hideNames: settings.aiHideNames, includeCriteria: settings.aiCriteria });
  return { prompt, items };
}

function Warnings({ list }) {
  if (!list?.length) return null;
  return html`<ul class="warnlist">${list.map((w, i) => html`<li key=${i}><${Icon} name="alert" />${typeof w === 'string' ? w : w.text}</li>`)}</ul>`;
}

export function AiPanel({ ctx, onOpenScript }) {
  const { settings, order, ai, answers, players, setSetting } = ctx;
  const [fallback, setFallback] = useState(null);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState('');
  const [fresh, setFresh] = useState(null); // result of the last parse in this session
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(text, 250);
  const lastApplied = useRef('');
  const count = Object.keys(answers).filter((u) => players[u]).length;

  const makePrompt = async () => { const aid = await ensureIds(ctx); return buildExport(ctx, aid); };

  const onCopy = async () => {
    setBusy(true);
    try {
      const { prompt } = await makePrompt();
      if (await copyText(prompt.text)) { setCopied(true); setFallback(null); toast('Đã sao chép. Dán vào ChatGPT, Claude hoặc Gemini.'); }
      else { setCopied(true); setFallback(prompt.text); toast('Trình duyệt chặn sao chép. Hãy chọn và sao chép thủ công.', 'error'); }
    } finally { setBusy(false); }
  };
  const onDownload = async (kind) => {
    setBusy(true);
    try {
      const { prompt, items } = await makePrompt();
      const c = ctx.ref.current;
      const stamp = `${c.code}-${c.round}`;
      const r = kind === 'json'
        ? await saveText(`prompt-${stamp}.json`, JSON.stringify(exportPayload({ code: c.code, roundId: c.round, question: c.pub.question, criteria: c.criteria, items, n: c.settings.aiN, maxScore: c.settings.maxScore, hideNames: c.settings.aiHideNames, prompt: prompt.text }), null, 2), 'application/json')
        : await saveText(`prompt-${stamp}.txt`, prompt.text);
      if (r === 'download') toast('Đã tải xuống.');
      else if (r === 'copied') toast('Trình duyệt chặn tải xuống nên đã sao chép nội dung thay thế.');
      else { setFallback(prompt.text); toast('Không tải được. Hãy sao chép thủ công.', 'error'); }
    } finally { setBusy(false); }
  };

  const importText = async (raw) => {
    const c = ctx.ref.current;
    const aid = await ensureIds(ctx);
    const uidOf = Object.fromEntries(Object.entries(aid).filter(([uid]) => c.answers[uid]).map(([uid, id]) => [id, uid]));
    const blocked = Object.entries(c.answers).filter(([, a]) => looksLikeInjection(a.text)).map(([uid]) => aid[uid]).filter(Boolean);
    const parsed = parseAiResult(raw, { validIds: Object.keys(uidOf), blockedIds: blocked, maxScore: c.settings.maxScore, step: c.settings.scoreStep, n: c.settings.aiN });
    setFresh(parsed);
    if (parsed.status === 'empty') return;
    if (c.order.length && lastApplied.current !== raw) {
      const ok = await confirmDialog({ title: 'Thay lựa chọn hiện tại?', body: 'Kết quả AI sẽ thay các bài bạn đã chọn.', confirmLabel: 'Thay bằng kết quả AI' });
      if (!ok) return;
    }
    lastApplied.current = raw;
    const ok = await ctx.write(aiImportUpdates({ code: c.code, roundId: c.round, parsed, uidOf, at: fb.serverNow(), previouslyChosen: c.order }));
    if (ok) toast(parsed.status === 'json' ? `Đã chọn ${parsed.selected.length} bài từ kết quả AI.` : `Đã đánh dấu sẵn ${parsed.foundIds.length} bài AI nhắc tới. Hãy xác nhận.`);
  };

  useEffect(() => {
    if (!debounced.trim() || lastApplied.current === debounced) return;
    importText(debounced);
  }, [debounced]);

  const view = fresh || (ai ? { status: ai.status, selected: new Array(order.length), warnings: asArray(ai.warnings), foundIds: asArray(ai.foundIds), script: ai.script } : null);
  const hasScript = !!(ai && (ai.script || ai.raw));

  return html`<section class="card stack aipanel">
    <div class="row spread"><h3>Chấm bằng AI</h3><span class="help"><${Tab} text=${String(count)} /> bài</span></div>
    <div class="row row--nowrap"><span class="label grow">Chọn bao nhiêu bài</span><${Stepper} label="số bài AI chọn" value=${settings.aiN} min=${1} max=${12} onChange=${(v) => setSetting('aiN', v)} /></div>
    <${Toggle} label="Ẩn tên khi xuất" help="Bỏ cả tên và tổ khỏi prompt." on=${settings.aiHideNames} onChange=${(v) => setSetting('aiHideNames', v)} />
    <${Btn} kind="primary" big icon="copy" disabled=${busy || count === 0} onClick=${onCopy}>Sao chép Prompt cho AI<//>
    <div class="row">
      <${Btn} small icon="download" disabled=${busy || count === 0} onClick=${() => onDownload('json')}>Tải JSON<//>
      <${Btn} small icon="file" disabled=${busy || count === 0} onClick=${() => onDownload('txt')}>Tải TXT<//>
    </div>
    ${copied ? html`<div class="stack-s"><span class="label">Mở AI trong tab mới</span><div class="row">${AI_SITES.map(([n, u]) => html`<a key=${n} class="btn btn--small" href=${u} target="_blank" rel="noopener noreferrer"><${Icon} name="external" />${n}</a>`)}</div></div>` : null}
    ${fallback ? html`<${SelectAllBox} text=${fallback} />` : null}
    <hr class="hr" />
    <label class="field"><span class="label">Dán kết quả từ AI vào đây</span>
      <textarea class="textarea paste" rows="5" value=${text} placeholder="Dán toàn bộ câu trả lời của AI. Hệ thống tự đọc và chọn bài."
        onInput=${(e) => setText(e.target.value)} onPaste=${(e) => { const v = e.clipboardData?.getData('text'); if (v && v.trim()) { e.preventDefault(); setText(v); importText(v); } }}></textarea></label>
    ${view ? html`<div class=${`aiview ${view.status === 'json' ? 'is-ok' : ''}`} role="status">
      ${view.status === 'json' ? html`<p class="strong"><${Icon} name="check-circle" />Đã đọc kết quả AI: chọn <${Tab} text=${String(fresh ? fresh.selected.length : order.length)} /> bài${fresh ? `, loại ${fresh.rejected.length} bài` : ''}${view.script ? ', có lời dẫn Host' : ''}.</p>`
        : view.status === 'free' ? html`<p class="strong"><${Icon} name="info" />Không đọc được JSON. Đã đánh dấu sẵn ${view.foundIds.length} bài AI nhắc tới${view.foundIds.length ? ` (${view.foundIds.join(', ')})` : ''}. Hãy kiểm tra rồi bấm Chọn hoặc bỏ chọn từng bài.</p>`
        : html`<p class="muted">Chưa có nội dung.</p>`}
      <${Warnings} list=${view.warnings} />
    </div>` : null}
    ${hasScript ? html`<${Btn} icon="book" onClick=${onOpenScript}>Mở lời dẫn của Host<//>` : null}
  </section>`;
}

/* ---------------------------------------------------------------- host script (reading mode) */

const SIZES = [1.35, 1.7, 2.1, 2.6, 3.2];

export function ScriptReader({ ctx, onClose }) {
  const { ai, options, aid } = ctx;
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(2);
  const bodyRef = useRef(null);
  const parsed = useMemo(() => (ai ? {
    status: ai.status, raw: ai.raw || '',
    script: ai.script ? { opening: ai.script.opening || '', closing: ai.script.closing || '', perOption: asArray(ai.script.perOption) } : null,
  } : null), [ai]);
  const optionNo = (id) => { const uid = Object.keys(aid).find((u) => aid[u] === id); const i = options.findIndex((o) => o.uid === uid); return i >= 0 ? i + 1 : null; };
  const pages = useMemo(() => scriptPages(parsed, optionNo), [parsed, options, aid]);
  const last = Math.max(0, pages.length - 1);
  const p = pages[Math.min(page, last)];
  const go = (d) => { setPage((x) => Math.min(last, Math.max(0, x + d))); bodyRef.current?.scrollTo?.(0, 0); };

  useEffect(() => {
    let rel = () => {};
    keepAwake().then((r) => { rel = r; });
    const key = (e) => { if (e.key === 'ArrowRight' || e.key === ' ') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', key);
    return () => { rel(); window.removeEventListener('keydown', key); };
  }, [last]);

  const touch = useRef(null);
  return html`<${Sheet} title="Lời dẫn của Host" onClose=${onClose} wide actions=${html`
      <${Btn} small class="btn--icon" aria-label="Chữ nhỏ hơn" icon="minus" disabled=${size === 0} onClick=${() => setSize(size - 1)} />
      <${Btn} small class="btn--icon" aria-label="Chữ lớn hơn" icon="plus" disabled=${size === SIZES.length - 1} onClick=${() => setSize(size + 1)} />`}>
    ${!p ? html`<div class="reader__empty"><p>Chưa có lời dẫn. Dán kết quả AI ở bước chấm bài để có lời dẫn cho từng phương án.</p></div>` : html`
      <div class="reader" style=${{ '--reader-size': `${SIZES[size]}rem` }}
        onTouchStart=${(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd=${(e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1); }}>
        <div class="reader__meta"><span class="chip chip--no">${p.title}</span><span class="strong"><${Tab} text=${`${Math.min(page, last) + 1}/${pages.length}`} /></span></div>
        <div class="reader__text" ref=${bodyRef} tabindex="0" aria-live="polite">${p.text}</div>
        <div class="reader__nav">
          <${Btn} big icon="arrow-left" disabled=${page <= 0} onClick=${() => go(-1)}>Trước<//>
          <${Btn} big kind="primary" disabled=${page >= last} onClick=${() => go(1)}>Sau<//>
        </div>
      </div>`}
  <//>`;
}
