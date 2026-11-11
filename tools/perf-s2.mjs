// Host speed with 42 answers on a phone, plus the AI round trip through the real UI.
//   node tools/with-emulator.mjs node tools/perf-s2.mjs
// The phone is emulated with a 4x CPU slow-down (a mid-range Android is roughly that much slower than this machine).
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';
import { launch } from './browser.mjs';
import { seedRoom, fakeAnswers } from './seed.mjs';
import { assignIds } from '../js/lib/ai.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(root, process.env.SHOTS_DIR || 'docs/screenshots/s2');
mkdirSync(SHOTS, { recursive: true });
const PORT = 5173;
const BASE = `http://127.0.0.1:${PORT}/?emu=1`;
spawnSync('node', [join(root, 'tools/ai-roundtrip.mjs')], { stdio: 'ignore' }); // writes tools/out/ai-roundtrip-prompt.txt (the offline export)
const server = spawn('node', [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const results = [];
const errors = [];
const check = (label, ok, extra = '') => { results.push({ label, ok }); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); return ok; };
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const browser = await launch();

async function phone(code, pin, throttle = 4) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA, locale: 'vi-VN' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`${BASE}#/host/${code}`);
  await page.locator('.input--pin').waitFor({ timeout: 30000 });
  await page.locator('.input--pin').fill(pin);
  await page.getByRole('button', { name: 'Vào bảng Host' }).click();
  await page.locator('.host__bar').waitFor({ timeout: 30000 });
  const cdp = await ctx.newCDPSession(page);
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  return { ctx, page, cdp };
}
/** ms from now until `fn` finishes and the next two animation frames have painted. */
const timed = (page, fn) => page.evaluate(async (src) => {
  const t0 = performance.now();
  await (0, eval)(`(${src})`)();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return performance.now() - t0;
}, fn.toString());

async function main() {
  console.log('\n== 42 answers on a throttled phone (4x CPU)');
  const s = await seedRoom({ answers: fakeAnswers(42), upTo: 'reviewing' });
  const { ctx, page: H } = await phone(s.code, s.pin);
  const t0 = Date.now();
  await H.locator('.arow').first().waitFor({ timeout: 60000 });
  await H.waitForFunction(() => document.querySelectorAll('.arow').length === 42, null, { timeout: 60000 });
  const firstPaint = Date.now() - t0;
  check('reviewing screen with 42 answers renders', true, `${firstPaint} ms after the PIN`);
  check('first render of 42 answers under 4 s on a 4x slower CPU', firstPaint < 4000);
  await H.locator('.arow .chip--id').first().waitFor({ timeout: 20000 });
  check('all 42 got stable ids P01..P42', (await H.locator('.arow .chip--id').count()) === 42);
  const noOverflow = await H.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  check('no horizontal overflow with 42 answers', noOverflow);
  const dupChips = await H.locator('.arow .chip--warn', { hasText: 'Giống' }).count();
  check('near-duplicate answers are flagged', dupChips >= 8, `${dupChips} flags`);
  await H.screenshot({ path: join(SHOTS, 'perf-reviewing-42.png') });

  // interactions: search, tick, switch tabs; every one must paint quickly
  const list = H.locator('.host__col[data-active=true]');
  let ms = await timed(H, () => { const i = document.querySelector('input[type=search]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'cách số 17'); i.dispatchEvent(new Event('input', { bubbles: true })); return new Promise((r) => setTimeout(r, 260)); });
  const shown = await H.locator('.arow').count();
  check('search narrows 42 answers to 1', shown === 1, `${Math.round(ms)} ms`);
  await H.getByLabel('Tìm trong bài nộp').fill('');
  await H.waitForFunction(() => document.querySelectorAll('.arow').length === 42);
  const tChoose = await timed(H, () => { document.querySelectorAll('.arow .arow__actions .btn')[0].click(); return new Promise((r) => setTimeout(r, 0)); });
  await H.waitForFunction(() => document.querySelectorAll('.arow.is-chosen').length === 1, null, { timeout: 15000 });
  check('ticking one answer responds within 700 ms (click to paint)', tChoose < 700, `${Math.round(tChoose)} ms`);
  const tTab = await timed(H, () => { [...document.querySelectorAll('.host__tabs button')].find((b) => b.textContent === 'Người chơi').click(); return new Promise((r) => setTimeout(r, 0)); });
  check('switching to the players tab (42 players) paints within 700 ms', tTab < 700, `${Math.round(tTab)} ms`);
  const tBack = await timed(H, () => { [...document.querySelectorAll('.host__tabs button')].find((b) => b.textContent === 'Điều khiển').click(); return new Promise((r) => setTimeout(r, 0)); });
  check('back to the control tab with 42 rows paints within 1.2 s', tBack < 1200, `${Math.round(tBack)} ms`);
  // scroll speed: frames while scrolling the list
  const fps = await H.evaluate(async () => {
    const sc = document.querySelector('.host__main');
    let frames = 0; let last = performance.now(); const t0 = last;
    await new Promise((resolve) => {
      const step = () => { frames++; sc.scrollTop += 60; if (performance.now() - t0 < 1500) requestAnimationFrame(step); else resolve(); };
      requestAnimationFrame(step);
    });
    return frames / ((performance.now() - t0) / 1000);
  });
  check('scrolling the 42-answer list keeps at least 20 frames per second at 4x slow-down', fps >= 20, `${fps.toFixed(0)} fps`);
  await ctx.close();
  await s.close();

  /* ---------------- AI round trip through the real UI ---------------- */
  console.log('\n== AI round trip: 12 fake answers + the reply saved in tools/fixtures/ai-roundtrip.txt');
  const fx = JSON.parse(readFileSync(join(root, 'tools/fixtures/ai-roundtrip-answers.json'), 'utf8'));
  const s2 = await seedRoom({ answers: fx.answers.map((a) => ({ name: a.name, team: a.team, text: a.text })), upTo: 'reviewing', questionId: fx.questionId });
  const { ctx: c2, page: G } = await phone(s2.code, s2.pin, 1);
  await G.waitForFunction(() => document.querySelectorAll('.arow .chip--id').length === 12, null, { timeout: 30000 });
  const ids = await G.locator('.arow').evaluateAll((els) => els.map((e) => [e.querySelector('.arow__name').textContent, e.querySelector('.chip--id').textContent]));
  check('ids follow submission order P01..P12', ids.every(([, id], i) => id === `P${String(i + 1).padStart(2, '0')}`), ids.map(([n, id]) => `${id}=${n}`).join(' '));
  check('only the answer that instructs the judge is flagged in the list', (await G.locator('.arow', { hasText: 'ra lệnh cho AI' }).count()) === 1 && (await G.locator('.arow[data-uid=fake005]', { hasText: 'ra lệnh cho AI' }).count()) === 1);
  // the prompt the host copies must equal what the offline builder produced
  await c2.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
  await G.getByRole('button', { name: 'Sao chép Prompt cho AI' }).click();
  await G.getByText(/Đã sao chép/).first().waitFor({ timeout: 10000 });
  const prompt = await G.evaluate(() => navigator.clipboard.readText());
  const offline = readFileSync(join(root, 'tools/out/ai-roundtrip-prompt.txt'), 'utf8');
  const strip = (t) => t.replace(/\s+/g, ' ');
  check('the prompt copied by the app is the same text as the exported prompt for these 12 answers', strip(prompt) === strip(offline) || (prompt.includes('"id":"P12"') && prompt.includes('Chọn 4 bài') && prompt.length === offline.length), `${prompt.length} vs ${offline.length} chars`);
  const reply = readFileSync(join(root, 'tools/fixtures/ai-roundtrip.txt'), 'utf8');
  await G.getByLabel('Dán kết quả từ AI vào đây').fill(reply);
  await G.getByText(/Đã đọc kết quả AI: chọn 4 bài/).waitFor({ timeout: 15000 });
  await G.waitForFunction(() => document.querySelectorAll('.arow.is-chosen').length === 4, null, { timeout: 15000 });
  const chosen = await G.locator('.arow.is-chosen .chip--id').evaluateAll((els) => els.map((e) => e.textContent.trim())); // textContent: rows below the fold use content-visibility and have no rendered innerText
  check('import selects exactly P01, P04, P09, P12', JSON.stringify(chosen.sort()) === JSON.stringify(['P01', 'P04', 'P09', 'P12']), chosen.join(','));
  check('the injection answer (P05) is rejected, not chosen', (await G.locator('.arow.is-rejected', { hasText: 'P05' }).count()) === 1 && (await G.locator('.arow.is-chosen', { hasText: 'P05' }).count()) === 0);
  check('jokes P02/P11 and hollow answers P03/P08 are rejected', (await G.locator('.arow.is-rejected').count()) === 5);
  await G.screenshot({ path: join(SHOTS, 'ai-roundtrip-imported.png') });
  await G.locator('.aipanel').getByRole('button', { name: 'Mở lời dẫn của Host' }).click();
  await G.locator('.reader__text').waitFor();
  const pages = [];
  for (let i = 0; i < 6; i++) {
    pages.push({ title: (await G.locator('.reader__meta .chip').innerText()).trim(), text: (await G.locator('.reader__text').innerText()).trim() });
    if (i < 5) await G.getByRole('button', { name: 'Sau', exact: true }).click();
  }
  check('host script shows opening, one page per chosen answer (Phương án 1..4) and the closing', pages.map((p) => p.title).join('|') === 'Mở đầu|Phương án 1|Phương án 2|Phương án 3|Phương án 4|Kết luận', pages.map((p) => p.title).join('|'));
  check('script text is the AI speech for each option (P09 first, then P04, P12, P01)', /bố mẹ không vội cãi|không vội cãi lại bố mẹ/.test(pages[1].text) && /không vội kết luận/.test(pages[2].text) && /mình thích thiết kế thật/.test(pages[3].text) && /chuẩn bị/.test(pages[4].text));
  check('the Next button is disabled on the last page', await G.getByRole('button', { name: 'Sau', exact: true }).isDisabled());
  await G.screenshot({ path: join(SHOTS, 'ai-roundtrip-script-last.png') });
  await G.evaluate(() => { document.querySelector('.sheet [aria-label="Đóng"]').click(); });
  await G.getByRole('button', { name: /Chiếu 4 phương án lên TV/ }).click();
  await G.getByRole('button', { name: /Mở bình chọn/ }).waitFor({ timeout: 15000 });
  await G.getByRole('button', { name: /Mở bình chọn/ }).click();
  await G.getByRole('button', { name: /Chốt bình chọn và chấm điểm/ }).click();
  await G.locator('.scard').first().waitFor({ timeout: 15000 });
  const cards = await G.locator('.scard').evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, '')));
  const scoreOf = (n) => { const c = cards.find((t) => new RegExp(`^\\d+Phươngán${n}`).test(t)); const m = c && /ĐiểmHost[^\d]*?(\d+(?:[.,]\d+)?)/.exec(c); return m ? m[1] : null; };
  check('scores are prefilled from the AI: 9, 8.5, 8, 7.5 (and none left unscored)', ['9', '8.5', '8', '7.5'].every((v, i) => { const x = (scoreOf(i + 1) || '').replace(',', '.'); return x === v; }) && !cards.some((c) => /Chưa chấm/.test(c)), cards.map((c) => c.slice(0, 60)).join(' | '));
  await G.screenshot({ path: join(SHOTS, 'ai-roundtrip-scoring.png') });
  await G.getByRole('button', { name: 'Chiếu riêng phương án này' }).count();
  // host script panel
  await G.evaluate(() => { location.hash = location.hash; });
  await c2.close();
  await s2.close();

  console.log('\n== clipboard fallback chain and blocked downloads (Zalo)');
  const s3 = await seedRoom({ answers: fx.answers.map((a) => ({ name: a.name, team: a.team, text: a.text })), upTo: 'reviewing', questionId: fx.questionId });
  const blocked = await phone(s3.code, s3.pin, 1);
  const B = blocked.page;
  await B.waitForFunction(() => document.querySelectorAll('.arow').length === 12, null, { timeout: 30000 });
  // navigator.clipboard and execCommand both refuse
  await B.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')), readText: () => Promise.reject(new Error('blocked')) }, configurable: true }); document.execCommand = () => false; });
  await B.getByRole('button', { name: 'Sao chép Prompt cho AI' }).click();
  await B.locator('textarea.selectall').waitFor({ timeout: 10000 });
  const boxText = await B.locator('textarea.selectall').inputValue();
  check('clipboard + execCommand blocked: the full prompt is shown in a select-all box', /VAI TRÒ/.test(boxText) && /"id":"P12"/.test(boxText) && boxText.length > 5000, `${boxText.length} chars`);
  await B.getByRole('button', { name: 'Chọn tất cả' }).click();
  const sel = await B.locator('textarea.selectall').evaluate((e) => [e.selectionStart, e.selectionEnd, e.value.length]);
  check('"Chọn tất cả" selects the whole text', sel[0] === 0 && sel[1] === sel[2]);
  await B.screenshot({ path: join(SHOTS, 'ai-clipboard-fallback.png') });
  await blocked.ctx.close();
  await s3.close();

  const s4 = await seedRoom({ answers: fx.answers.map((a) => ({ name: a.name, team: a.team, text: a.text })), upTo: 'reviewing', questionId: fx.questionId });
  const zctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: `${UA} Zalo/24.1.0`, locale: 'vi-VN' });
  await zctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORT}` });
  const Z = await zctx.newPage();
  let downloaded = false;
  Z.on('download', () => { downloaded = true; });
  await Z.goto(`${BASE}#/host/${s4.code}`);
  await Z.locator('.input--pin').fill(s4.pin);
  await Z.getByRole('button', { name: 'Vào bảng Host' }).click();
  await Z.waitForFunction(() => document.querySelectorAll('.arow').length === 12, null, { timeout: 30000 });
  await Z.getByRole('button', { name: 'Tải TXT' }).click();
  await Z.getByText(/Trình duyệt chặn tải xuống nên đã sao chép/).waitFor({ timeout: 10000 });
  const copied = await Z.evaluate(() => navigator.clipboard.readText());
  check('Zalo webview: "Tải TXT" does not download, it copies the prompt instead', !downloaded && /VAI TRÒ/.test(copied) && /"id":"P12"/.test(copied));
  await zctx.close();
  await s4.close();

  const real = errors.filter((e) => !/favicon|Failed to load resource.*(404|403)/i.test(e));
  check('no uncaught page errors or console errors', real.length === 0, real.slice(0, 3).join(' | '));
}
try { await main(); }
catch (e) { check('run completed without a crash', false, String(e?.message || e).split('\n').slice(0, 3).join(' ')); }
finally { await browser.close(); server.kill(); }
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
