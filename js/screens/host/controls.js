// The "Điều khiển" tab: one panel per phase and one big button in the thumb zone (the dock).
import { useState, useEffect, useRef } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Clock, Tab, toast, confirmDialog, ErrorPanel } from '../../ui.js';
import * as fb from '../../fb.js';
import { useCountdown, useAction } from '../../hooks.js';
import { rp, extendTimerUpdate, pauseTimerUpdate, resumeTimerUpdate } from '../../lib/room-ops.js';
import { A } from '../../lib/phases.js';
import { PRESETS_S, parseDuration } from '../../lib/timer.js';
import { defaultBank } from '../../lib/bank.js';
import { Seg, Toggle, PHASE_LABEL } from './common.js';
import { AiPanel } from './ai-panel.js';
import { AnswerList } from './answers.js';
import { ShowcasePanel, VotingPanel, ScoringPanel, RevealPanel, LeaderboardPanel } from './flow.js';

function QuestionPicker({ bank, selected, setSelected, secs, setSecs, customSecs, setCustomSecs, onOpenBank }) {
  const sc = bank.find((s) => s.id === selected) || bank[0];
  return html`<div class="stack">
    <div class="stack-s"><div class="row spread"><span class="label">Tình huống</span><${Btn} small icon="book" onClick=${onOpenBank}>Quản lý câu hỏi<//></div>
      <div class="qpick" role="radiogroup" aria-label="Chọn tình huống">${bank.map((s, i) => html`<button key=${s.id} type="button" role="radio" aria-checked=${sc?.id === s.id} class="qpick__item" onClick=${() => { setSelected(s.id); setSecs(s.time); setCustomSecs(''); }}>
        <span class="qpick__n"><${Tab} text=${String(i + 1)} /></span><span class="grow">${s.title}</span><span class="xs"><${Tab} text=${`${s.time}s`} /></span></button>`)}</div>
      ${sc ? html`<details class="preview"><summary>Xem nội dung</summary><p class="qtext">${sc.text}</p>
        ${sc.criteria.length ? html`<span class="label">Tiêu chí chấm</span><ul class="criteria">${sc.criteria.map((c, i) => html`<li key=${i}>${c}</li>`)}</ul>` : null}</details>` : null}
    </div>
    <div class="stack-s"><span class="label">Thời gian</span>
      <div class="seg" role="group" aria-label="Thời gian làm bài">
        ${PRESETS_S.map((s) => html`<button key=${s} aria-pressed=${!customSecs && secs === s} onClick=${() => { setSecs(s); setCustomSecs(''); }}>${s}s</button>`)}
        <button aria-pressed=${!!customSecs} onClick=${() => setCustomSecs(customSecs || String(secs))}>Khác</button>
      </div>
      ${customSecs !== '' ? html`<input class="input" inputmode="numeric" aria-label="Số giây" placeholder="Số giây, ví dụ 150 hoặc 2:30" value=${customSecs} onInput=${(e) => setCustomSecs(e.target.value.replace(/[^\d:]/g, ''))} />` : null}
    </div>
  </div>`;
}

/**
 * False for a moment after the phase changes. The dock button changes under the thumb on every step, so a double tap
 * (or a tap from a second Host device that has not caught up yet) must not land on the NEXT step's button.
 */
function useArmed(phase, ms = 700) {
  const [armed, setArmed] = useState(true);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    setArmed(false);
    const id = setTimeout(() => setArmed(true), ms);
    return () => clearTimeout(id);
  }, [phase]);
  return armed;
}

export function Controls({ ctx, joined, submittedCount, expected, onOpenBank, onOpenScript, embedAnswers = true, wide = false }) {
  const { code, pub, settings, step, write, setSetting, actions, options, bank, bankLoaded } = ctx;
  const phase = pub.phase;
  const ms = useCountdown(pub.timer);
  const list = bank.length ? bank : bankLoaded ? defaultBank() : [];
  const [selected, setSelected] = useState(pub.question?.id || '');
  const [secs, setSecs] = useState(settings.defaultSecs);
  const [customSecs, setCustomSecs] = useState('');
  const sel = list.find((q) => q.id === selected) || list[0];
  useEffect(() => { if (!selected && list[0]) { setSelected(list[0].id); setSecs(list[0].time); } }, [list.length]);
  const durationMs = customSecs !== '' ? parseDuration(customSecs) : secs * 1000;
  const running = pub.timer?.state === 'running';
  const paused = pub.timer?.state === 'paused';
  const act0 = useAction(async (fn) => fn());
  const armed = useArmed(phase);
  const act = { ...act0, pending: act0.pending || !armed };

  const start = () => act.run(async () => {
    if (!sel) return;
    if (!durationMs) { toast('Thời gian từ 10 giây đến 60 phút.', 'error'); return; }
    await write({ [rp(code, 'private/criteria')]: sel.criteria.length ? sel.criteria : null });
    await step(A.START, { question: { id: sel.id, title: sel.title, text: sel.text }, durationMs });
  });
  const confirmAbandon = async () => {
    const ok = await confirmDialog({ title: 'Huỷ vòng này?', body: 'Quay về sảnh chờ. Bài nộp của vòng này sẽ không được dùng nữa.', confirmLabel: 'Huỷ vòng', danger: true });
    if (ok) act.run(() => step(A.ABANDON, {}));
  };
  const confirmBackToShowcase = async () => {
    const ok = await confirmDialog({ title: 'Quay lại trình chiếu?', body: 'Phiếu bình chọn và số tay giơ của vòng này sẽ bị xoá để đếm lại từ đầu.', confirmLabel: 'Quay lại', danger: true });
    if (ok) act.run(() => actions.backToShowcase());
  };
  const confirmReveal = async () => {
    const unscored = options.filter((o) => o.score == null).length;
    if (unscored) {
      const ok = await confirmDialog({ title: `Còn ${unscored} phương án chưa chấm`, body: 'Phương án chưa chấm được tính 0 điểm. Vẫn công bố?', confirmLabel: 'Vẫn công bố' });
      if (!ok) return;
    }
    act.run(() => actions.reveal());
  };

  const sec = (children) => html`<div class="dock__sec">${children}</div>`;
  let body = null;
  let dock = null;
  let secondary = null;

  if (phase === 'lobby') {
    body = html`<section class="card stack"><${QuestionPicker} bank=${list} selected=${sel?.id} setSelected=${setSelected} secs=${secs} setSecs=${setSecs} customSecs=${customSecs} setCustomSecs=${setCustomSecs} onOpenBank=${onOpenBank} /></section>`;
    dock = html`<${Btn} kind="primary" big icon="play" disabled=${act.pending || !durationMs || joined === 0 || !sel} onClick=${start}>Bắt đầu câu hỏi<//>`;
  } else if (phase === 'answering') {
    dock = html`<${Btn} kind="primary" big icon="lock" disabled=${act.pending} onClick=${() => act.run(() => step(A.LOCK, {}))}>Khoá bài<//>`;
    secondary = sec(html`<${Btn} small icon="x" onClick=${confirmAbandon}>Huỷ vòng<//>`);
  } else if (phase === 'locked') {
    dock = html`<${Btn} kind="primary" big icon="arrow-right" disabled=${act.pending} onClick=${() => act.run(() => step(A.REVIEW, {}))}>Bắt đầu chấm bài<//>`;
    secondary = sec(html`<${Btn} small icon="undo" disabled=${act.pending} onClick=${() => act.run(() => step(A.REOPEN, { durationMs: 60_000 }))}>Mở lại nộp bài 60 giây<//><${Btn} small icon="x" onClick=${confirmAbandon}>Huỷ vòng<//>`);
  } else if (phase === 'reviewing') {
    body = html`<${AiPanel} ctx=${ctx} onOpenScript=${onOpenScript} />${embedAnswers ? html`<section class="card stack"><${AnswerList} ctx=${ctx} selectable=${true} /></section>` : wide ? html`<p class="help">Chọn bài trong cột "Bài nộp" bên phải.</p>` : null}`;
    dock = html`<${Btn} kind="primary" big icon="tv" disabled=${act.pending || options.length === 0} onClick=${() => act.run(() => actions.showcase())}>${options.length ? `Chiếu ${options.length} phương án lên TV` : 'Chọn ít nhất 1 bài để chiếu'}<//>`;
    secondary = sec(html`<${Btn} small icon="undo" onClick=${() => act.run(() => step(A.BACK_LOCKED, {}))}>Quay lại khoá bài<//><${Btn} small icon="x" onClick=${confirmAbandon}>Huỷ vòng<//>`);
  } else if (phase === 'showcase') {
    body = html`<${ShowcasePanel} ctx=${ctx} onOpenScript=${onOpenScript} />`;
    dock = options.length >= 2
      ? html`<${Btn} kind="primary" big icon="hand" disabled=${act.pending} onClick=${() => act.run(() => step(A.OPEN_VOTING, { phone: settings.phoneVoting, live: settings.liveTally }))}>Mở bình chọn<//>`
      : html`<${Btn} kind="primary" big icon="arrow-right" disabled=${act.pending} onClick=${() => act.run(() => step(A.SKIP_VOTING, {}))}>Chuyển sang chấm điểm<//>`;
    secondary = sec(html`${options.length >= 2 ? html`<${Btn} small icon="arrow-right" onClick=${() => act.run(() => step(A.SKIP_VOTING, {}))}>Bỏ qua bình chọn<//>` : null}
      <${Btn} small icon="undo" onClick=${() => act.run(() => step(A.BACK_REVIEW, {}))}>Quay lại chọn bài<//>`);
  } else if (phase === 'voting') {
    body = html`<${VotingPanel} ctx=${ctx} onOpenScript=${onOpenScript} />`;
    dock = html`<${Btn} kind="primary" big icon="check" disabled=${act.pending} onClick=${() => act.run(() => step(A.CLOSE_VOTING, {}))}>Chốt bình chọn và chấm điểm<//>`;
    secondary = sec(html`<${Btn} small icon="undo" onClick=${confirmBackToShowcase}>Quay lại trình chiếu<//>`);
  } else if (phase === 'scoring') {
    body = html`<${ScoringPanel} ctx=${ctx} />`;
    dock = html`<${Btn} kind="primary" big icon="award" disabled=${act.pending || !options.length} onClick=${confirmReveal}>Công bố người thắng<//>`;
    secondary = sec(html`<${Btn} small icon="hand" onClick=${() => act.run(() => step(A.REOPEN_VOTING, { phone: settings.phoneVoting, live: settings.liveTally }))}>Mở lại bình chọn<//>`);
  } else if (phase === 'reveal') {
    body = html`<${RevealPanel} ctx=${ctx} />`;
    dock = html`<${Btn} kind="primary" big icon="trophy" disabled=${act.pending} onClick=${() => act.run(() => step(A.LEADERBOARD, {}))}>Xem bảng điểm<//>`;
    secondary = sec(html`<${Btn} small icon="undo" disabled=${act.pending} onClick=${() => act.run(() => actions.undoAward())}>Hoàn tác công bố<//><${Btn} small icon="arrow-right" onClick=${() => act.run(() => step(A.NEXT, {}))}>Bỏ qua bảng điểm<//>`);
  } else if (phase === 'leaderboard') {
    body = html`<${LeaderboardPanel} ctx=${ctx} />`;
    dock = html`<${Btn} kind="primary" big icon="arrow-right" disabled=${act.pending} onClick=${() => act.run(() => step(A.NEXT, {}))}>Câu tiếp theo<//>`;
    secondary = sec(html`<${Btn} small icon="undo" disabled=${act.pending} onClick=${() => act.run(() => actions.undoAward())}>Hoàn tác công bố<//><${Btn} small icon="left" onClick=${() => act.run(() => step(A.BACK_REVEAL, {}))}>Về kết quả<//>`);
  }

  const status = phase !== 'lobby' ? html`<section class="card stack">
    <div class="row spread"><span class="label">${PHASE_LABEL[phase] || phase}</span><span class="help">${pub.question?.title}</span></div>
    ${phase === 'answering' ? html`<div class=${`bigtimer ${ms <= 10_000 && running ? 'is-hot' : ''}`}><${Clock} ms=${ms} />${paused ? html`<span class="xs"> tạm dừng</span>` : null}</div>
      <div class="progress" aria-hidden="true"><i style=${{ width: `${pub.timer?.durationMs ? Math.min(100, ((pub.timer.durationMs - ms) / pub.timer.durationMs) * 100) : 0}%` }}></i></div>` : null}
    ${['answering', 'locked'].includes(phase) ? html`<div class="kv"><span>Đã nộp</span><span class="strong"><${Tab} text=${`${submittedCount}/${expected}`} /></span></div>` : null}
    ${phase === 'answering' ? html`<div class="row row--nowrap">
      <${Btn} small class="grow" icon="plus" disabled=${act.pending} onClick=${() => act.run(async () => write(extendTimerUpdate({ code, timer: pub.timer, addMs: settings.addMs, nowServer: fb.serverNow() })))}>${Math.round(settings.addMs / 1000)} giây<//>
      ${paused ? html`<${Btn} small class="grow" icon="play" disabled=${act.pending} onClick=${() => act.run(async () => write(resumeTimerUpdate({ code, timer: pub.timer, nowServer: fb.serverNow() })))}>Tiếp tục<//>`
        : html`<${Btn} small class="grow" icon="pause" disabled=${act.pending || !running} onClick=${() => act.run(async () => write(pauseTimerUpdate({ code, timer: pub.timer, nowServer: fb.serverNow() })))}>Tạm dừng<//>`}
    </div>` : null}
  </section>` : null;

  return html`<div class="stack">
    ${status}
    ${body}
    ${phase === 'lobby' || phase === 'answering' ? html`<section class="card stack">
      <h3>Cách nộp bài</h3>
      <${Seg} label="Cách nộp bài" value=${settings.mode} onChange=${(v) => setSetting('mode', v)} options=${[['all', 'Cả lớp'], ['team', 'Đại diện tổ']]} />
      <${Toggle} label="Cho sửa bài đến khi khoá" on=${settings.allowEdit} onChange=${(v) => setSetting('allowEdit', v)} />
      <${Toggle} label="Khoá phòng, không cho vào thêm" on=${settings.lockJoin} onChange=${(v) => setSetting('lockJoin', v)} />
    </section>` : null}
    ${act.error ? html`<${ErrorPanel} text=${fb.describeError(act.error).text} />` : null}
    <div class="host__dock" data-slot="main">${secondary}${dock}</div>
  </div>`;
}
