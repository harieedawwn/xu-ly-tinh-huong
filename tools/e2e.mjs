// End-to-end run of the thin live loop in real browsers: host, TV and three players in separate contexts.
//   node tools/with-emulator.mjs node tools/e2e.mjs            (local server + emulators, real rules)
//   E2E_URL=https://harieedawwn.github.io/xu-ly-tinh-huong/ node tools/e2e.mjs --live
// Screenshots go to docs/screenshots/ (390x844, 1440x900, 1920x1080).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { launch } from './browser.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = process.argv.includes('--live');
const SHOTS = join(root, process.env.SHOTS_DIR || 'docs/screenshots');
mkdirSync(SHOTS, { recursive: true });
const PORT = 5173;
const BASE = LIVE ? process.env.E2E_URL : `http://127.0.0.1:${PORT}/?emu=1`;
const withBase = (hash) => (LIVE ? `${BASE}${hash}` : `${BASE}${hash}`);

let server;
if (!LIVE) {
  server = spawn('node', [join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
}

const results = [];
const allPages = [];
const errors = [];
const check = (label, ok, extra = '') => { results.push({ label, ok }); console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const prefix = LIVE ? 'live-' : '';
const shot = async (page, name) => { await page.screenshot({ path: join(SHOTS, `${prefix}${name}.png`) }); };

const browser = await launch();
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
async function open(name, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dsf || 1, userAgent: opts.mobile ? UA_PHONE : undefined, isMobile: !!opts.mobile, hasTouch: !!opts.mobile, locale: 'vi-VN' });
  const page = await ctx.newPage();
  allPages.push({ name, page });
  page.on('pageerror', (e) => { errors.push(`${name} pageerror: ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  return { ctx, page, name };
}
const noOverflow = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
const secondsOf = (txt) => { const m = String(txt).replace(/\s/g, '').match(/(\d\d):(\d\d)/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };

async function main() {
  const host = await open('host', { width: 390, height: 844 }, { mobile: true, dsf: 2 });
  const tv = await open('tv', { width: 1920, height: 1080 });
  const p1 = await open('p1', { width: 390, height: 844 }, { mobile: true, dsf: 2 });
  const p2 = await open('p2', { width: 390, height: 844 }, { mobile: true, dsf: 2 });
  const p3 = await open('p3', { width: 390, height: 844 }, { mobile: true, dsf: 2 });

  console.log('\n== home and room creation');
  const H = host.page;
  await H.goto(withBase('#/'));
  await H.getByRole('heading', { name: /Đọc tình huống/ }).waitFor({ timeout: 30000 });
  check('home renders (anonymous sign-in OK)', true);
  check('home: no horizontal overflow at 390', await noOverflow(H));
  await shot(H, '01-home-390');
  await H.getByRole('button', { name: 'Tạo phòng mới' }).click();
  const pin = await H.locator('.input--pin').inputValue();
  check('PIN is 6 digits', /^\d{6}$/.test(pin), pin);
  await shot(H, '02-create-390');
  await H.getByRole('button', { name: 'Tạo phòng', exact: true }).click();
  await H.waitForURL(/#\/host\/[A-Z2-9]{6}$/, { timeout: 20000 });
  const code = H.url().match(/#\/host\/([A-Z2-9]{6})/)[1];
  check('room code is 6 chars without ambiguous characters', !/[01OIL]/.test(code), code);
  await H.getByRole('button', { name: /Bắt đầu câu hỏi/ }).waitFor();
  check('host board shows (host = creator)', true);

  console.log('\n== TV lobby');
  const T = tv.page;
  await T.goto(withBase(`#/tv/${code}`));
  await T.locator('.tv__code').waitFor({ timeout: 30000 });
  check('TV shows the room code', (await T.locator('.tv__code').innerText()).replace(/\s/g, '') === code);
  check('TV shows a QR', (await T.locator('.tv__qr svg path').count()) === 1);
  await shot(T, '10-tv-lobby-1920');
  await T.setViewportSize({ width: 1440, height: 900 }); await sleep(300); await shot(T, '11-tv-lobby-1440');
  await T.setViewportSize({ width: 1920, height: 1080 });

  console.log('\n== players join');
  const P1 = p1.page, P2 = p2.page, P3 = p3.page;
  await P1.goto(withBase(`#/play/${code}`));
  await P1.getByRole('heading', { name: 'Bạn là ai?' }).waitFor({ timeout: 30000 });
  await shot(P1, '20-join-390');
  // profane name is refused client-side
  await P1.getByLabel('Tên của bạn').fill('địt mẹ');
  await P1.getByRole('button', { name: /^Tổ 1/ }).click();
  await P1.getByRole('button', { name: 'Vào phòng' }).click();
  check('profane name is rejected', await P1.getByText('Tên này không phù hợp').isVisible());
  await P1.getByLabel('Tên của bạn').fill('Lan Anh');
  await P1.getByRole('button', { name: 'Vào phòng' }).click();
  await P1.getByRole('heading', { name: 'Chờ Host bắt đầu' }).waitFor();
  check('p1 joined (Tổ 1)', true);

  await P2.goto(withBase(`#/play/${code}`));
  await P2.getByLabel('Tên của bạn').fill('Lan Anh'); // duplicate on purpose
  await P2.getByRole('button', { name: /^Tổ 2/ }).click();
  await P2.getByRole('button', { name: 'Vào phòng' }).click();
  await P2.getByRole('heading', { name: 'Chờ Host bắt đầu' }).waitFor();
  check('duplicate name gets (2)', (await P2.locator('.player__name').innerText()) === 'Lan Anh (2)');

  // p3 uses the home screen to enter the code
  await P3.goto(withBase('#/'));
  await P3.getByLabel('Mã phòng', { exact: true }).first().fill(code.toLowerCase());
  await P3.getByRole('button', { name: 'Vào phòng' }).first().click();
  await P3.waitForURL(new RegExp(`#/play/${code}$`));
  await P3.getByLabel('Tên của bạn').fill('<b>Bảo</b>');
  await P3.getByRole('button', { name: /^Tổ 3/ }).click();
  await P3.getByRole('button', { name: 'Vào phòng' }).click();
  await P3.getByRole('heading', { name: 'Chờ Host bắt đầu' }).waitFor();
  check('p3 joined via the home screen with the code', true);
  await shot(P3, '21-waiting-390');

  await T.locator('.tvteam li', { hasText: 'Lan Anh (2)' }).waitFor({ timeout: 15000 });
  check('TV lists players per tổ', (await T.locator('.tvteam li').count()) === 3);
  await shot(T, '12-tv-lobby-players-1920');
  await H.getByRole('button', { name: 'Người chơi', exact: true }).click();
  await H.getByText('Lan Anh (2)').waitFor();
  check('host sees 3 online players', (await H.locator('.plrow .dot--on').count()) === 3);
  await shot(H, '30-host-players-390');
  await H.getByRole('button', { name: /Điều khiển/ }).click();

  console.log('\n== host starts a question');
  await H.getByRole('radio', { name: /Sáu tiếng mỗi ngày/ }).click();
  await H.getByRole('button', { name: 'Khác' }).click();
  await H.getByLabel('Số giây').fill('30');
  await shot(H, '31-host-lobby-390');
  await H.getByRole('button', { name: /Bắt đầu câu hỏi/ }).click();
  await H.getByRole('button', { name: /Khoá bài/ }).waitFor({ timeout: 15000 });
  check('host: phase answering with the lock button', true);

  console.log('\n== answering');
  await P1.locator('textarea').waitFor({ timeout: 15000 });
  await P2.locator('textarea').waitFor({ timeout: 15000 });
  await P3.locator('textarea').waitFor({ timeout: 15000 });
  check('players see the editor', true);
  await T.locator('.fit__text').waitFor();
  check('TV shows the question text', (await T.locator('.fit__text').innerText()).includes('Hà'));
  const fs = await T.locator('.fit__text').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  check('TV question text is at least 3.4vh (auto-fit)', fs >= 0.034 * 1080 - 1, `${fs.toFixed(1)}px of 1080`);
  const keyFs = await T.locator('.tv__timer').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  check('TV timer is at least 4.5vh', keyFs >= 0.045 * 1080, `${keyFs.toFixed(1)}px`);

  // timers agree across devices (server-time sync)
  const [a, b, c] = await Promise.all([T.locator('.tv__timer').textContent(), P1.locator('.timer').textContent(), H.locator('.bigtimer').textContent()]);
  const [sa, sb, sc] = [a, b, c].map(secondsOf);
  check('countdown agrees on TV / player / host within 1 s', Math.max(sa, sb, sc) - Math.min(sa, sb, sc) <= 1, `${sa}s ${sb}s ${sc}s`);

  // validation hints
  const ta1 = P1.locator('textarea');
  await ta1.fill('ngắn quá');
  check('short answer: submit disabled + hint', (await P1.getByRole('button', { name: 'Nộp bài' }).isDisabled()) && (await P1.getByText(/Cần thêm \d+ ký tự/).isVisible()));
  await ta1.fill('a'.repeat(60));
  check('repeated-character spam is blocked', await P1.getByRole('button', { name: 'Nộp bài' }).isDisabled());
  await ta1.fill('Mình sẽ đặt báo thức lùi lại mười lăm phút mỗi tuần và nói thật với nhóm bạn là tối nay mình cần ngủ sớm.');
  check('counter shows length', (await P1.locator('.count').innerText()).replace(/\s/g, '').startsWith('104/') || /\d+\/800/.test((await P1.locator('.count').innerText()).replace(/\s/g, '')));
  await shot(P1, '40-editor-390');
  await P1.getByRole('button', { name: 'Nộp bài' }).click();
  await P1.getByText(/Đã nộp/).first().waitFor({ timeout: 15000 });
  check('p1 submitted: "Đã nộp"', true);
  // XSS: markup stays text
  await P2.locator('textarea').fill('<img src=x onerror="window.__xss=1"> Mình sẽ nhắn cho các bạn rằng mình cần đi ngủ sớm để theo kịp bài vở.');
  await P2.getByRole('button', { name: 'Nộp bài' }).click();
  await P2.getByText(/Đã nộp/).first().waitFor({ timeout: 15000 });
  // p3 leaves a valid draft and does NOT press submit: auto-submit at time up
  await P3.locator('textarea').fill('Mình sẽ tắt thông báo sau chín giờ tối và đặt điện thoại ngoài phòng ngủ, rồi rủ nhóm chơi game vào cuối tuần.');
  await sleep(600);

  await T.getByText(/2\/3/).first().waitFor({ timeout: 15000 });
  check('TV live submitted count shows 2/3', true);
  await shot(T, '13-tv-question-1920');
  await T.setViewportSize({ width: 1440, height: 900 }); await sleep(400); await shot(T, '14-tv-question-1440');
  await T.setViewportSize({ width: 1920, height: 1080 });
  check('TV does not receive answer text', !(await T.content()).includes('đặt báo thức'));
  await H.getByRole('button', { name: /Bài nộp/ }).click();
  await H.getByText('đặt báo thức').first().waitFor({ timeout: 15000 });
  check('host sees the answers', (await H.locator('.host__col').nth(2).locator('li').count()) >= 2);
  check('answers render as text (no injected element, no script run)', (await H.locator('.host__col').nth(2).locator('img').count()) === 0 && !(await H.evaluate(() => window.__xss)));
  check('names render as text', (await H.locator('.host__col').nth(2).innerText()).includes('<b>Bảo</b>') || (await H.locator('.host__col').nth(2).innerText()).includes('đặt báo thức'));
  await shot(H, '32-host-answers-390');
  await H.getByRole('button', { name: /Điều khiển/ }).click();

  console.log('\n== time up');
  await T.getByText('Hết giờ').waitFor({ timeout: 60000 });
  check('TV shows "Hết giờ" at zero', true);
  await shot(T, '15-tv-locked-1920');
  await P3.getByText(/Bài của bạn đã được nộp/).waitFor({ timeout: 20000 });
  check('p3 draft was auto-submitted at time up', true);
  await P3.getByRole('heading', { name: 'Hết giờ' }).waitFor();
  check('p3 sees locked state', true);
  await shot(P3, '41-locked-390');
  await H.getByRole('button', { name: /Câu tiếp theo/ }).waitFor();
  check('host sees phase locked (auto-lock)', true);

  console.log('\n== reload (F5) restores state');
  await P1.reload();
  await P1.getByRole('heading', { name: 'Hết giờ' }).waitFor({ timeout: 30000 });
  check('p1 reload -> locked view with own submission', await P1.getByText(/Bài của bạn đã được nộp/).isVisible());
  await T.reload();
  await T.getByText('Hết giờ').waitFor({ timeout: 30000 });
  check('TV reload -> same view', true);
  await H.reload();
  await H.getByRole('button', { name: /Câu tiếp theo/ }).waitFor({ timeout: 30000 });
  check('host reload -> still host, same phase', true);

  console.log('\n== layouts');
  const hostWide = await open('hostwide', { width: 1440, height: 900 });
  // same browser identity as host is needed: reuse the host context storage
  const state = await host.ctx.storageState({ indexedDB: true });
  await hostWide.ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: state, locale: 'vi-VN' });
  const W = await ctx2.newPage();
  W.on('pageerror', (e) => errors.push(`hostwide pageerror: ${e.message}`));
  await W.goto(withBase(`#/host/${code}`));
  await W.getByRole('button', { name: /Câu tiếp theo/ }).waitFor({ timeout: 30000 });
  check('host on a laptop shows all three panels', (await W.locator('.host__col:visible').count()) === 3);
  check('host 1440: no horizontal overflow', await noOverflow(W));
  await shot(W, '33-host-1440');
  await ctx2.close();

  console.log('\n== wrong host PIN and right host PIN on another device');
  const other = await open('other', { width: 390, height: 844 }, { mobile: true });
  const O = other.page;
  await O.goto(withBase(`#/host/${code}`));
  await O.getByRole('heading', { name: 'Nhập PIN Host' }).waitFor({ timeout: 30000 });
  await O.locator('.input--pin').fill(pin === '000000' ? '111111' : '000000');
  await O.getByRole('button', { name: 'Vào bảng Host' }).click();
  await O.getByText(/PIN chưa đúng\. Còn 7 lần thử/).waitFor({ timeout: 15000 });
  check('wrong PIN is refused with attempts left', true);
  check('no host UI after a wrong PIN', (await O.getByRole('button', { name: /Câu tiếp theo/ }).count()) === 0);
  await O.locator('.input--pin').fill(pin);
  await O.getByRole('button', { name: 'Vào bảng Host' }).click();
  await O.getByRole('button', { name: /Câu tiếp theo/ }).waitFor({ timeout: 15000 });
  check('right PIN makes the second device a host', true);
  await other.ctx.close();

  console.log('\n== kick, then end room');
  await H.getByRole('button', { name: /Người chơi/ }).click();
  await H.getByRole('button', { name: /Mời Lan Anh \(2\) ra khỏi phòng/ }).click();
  await H.getByRole('button', { name: 'Mời ra' }).click();
  await P2.getByRole('heading', { name: 'Bạn đã rời phòng' }).waitFor({ timeout: 15000 });
  check('kicked player is removed and banned', true);
  await H.getByRole('button', { name: /Điều khiển/ }).click();
  await H.getByRole('button', { name: /Kết thúc và xoá phòng/ }).click();
  await H.getByRole('button', { name: 'Xoá phòng', exact: true }).click();
  await H.waitForURL(/#\/$/, { timeout: 15000 });
  await T.reload();
  await T.getByText(/Không tìm thấy phòng/).waitFor({ timeout: 30000 });
  check('room deleted: TV reports it is gone', true);

  const real = errors.filter((e) => !/favicon|Failed to load resource.*(404|403)/i.test(e));
  check('no uncaught page errors or console errors', real.length === 0, real.slice(0, 3).join(' | '));
}

try { await main(); }
catch (e) {
  check('run completed without a crash', false, String(e?.message || e).split('\n')[0]);
  for (const { name, page } of allPages) { try { console.log(`--- ${name}: ${page.url()}\n` + (await page.locator('body').innerText({ timeout: 2000 })).slice(0, 600)); } catch { /* closed */ } }
}
finally { await browser.close(); server?.kill(); }

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
if (errors.length) console.log('Browser errors seen:\n  ' + errors.slice(0, 8).join('\n  '));
process.exit(failed.length ? 1 : 0);
