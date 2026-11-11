// Security-rules test. Runs against the REAL database by default, or the local emulator with --emulator.
//   node tools/rules-test.mjs                       (real project; needs rules deployed; makes ~12 anonymous accounts)
//   node tools/with-emulator.mjs node tools/rules-test.mjs --emulator
// Creates a throwaway room (random code), checks allowed and forbidden actions, then deletes the room.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, ref, get, set, update, remove, onValue, serverTimestamp, connectDatabaseEmulator, goOffline, runTransaction, increment } from 'firebase/database';
import { firebaseConfig } from '../js/firebase-config.js';
import { generateCode } from '../js/lib/roomcode.js';
import { defaultTeams } from '../js/lib/teams.js';
import * as ops from '../js/lib/room-ops.js';
import { startTimer } from '../js/lib/timer.js';
import { A, transition } from '../js/lib/phases.js';
import { runTransition } from '../js/lib/tx.js';
import { rankOptions, buildAward, buildReveal, totals } from '../js/lib/scoring.js';
import { defaultBank } from '../js/lib/bank.js';
import { DEFAULT_SETTINGS, resizeTeams } from '../js/lib/settings.js';

const EMU = process.argv.includes('--emulator') || process.env.EMULATOR === '1';
let code = generateCode();
const PIN = '482915';
const apps = [];
let pass = 0, fail = 0;
const failures = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = (p = '') => `rooms/${code}${p ? '/' + p : ''}`;

async function client(name) {
  const app = initializeApp(firebaseConfig, `${name}-${code}`);
  apps.push(app);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (EMU) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  const cred = await signInAnonymously(auth);
  const offset = await new Promise((res) => onValue(ref(db, '.info/serverTimeOffset'), (s) => res(s.val() ?? 0), { onlyOnce: true }));
  return { name, uid: cred.user.uid, db, now: () => Date.now() + offset };
}

const isDenied = (e) => /permission[_ ]denied/i.test(`${e?.code} ${e?.message}`);
async function allow(label, p) {
  try { await p; pass++; console.log(`  ok    ${label}`); return true; }
  catch (e) { fail++; failures.push(label); console.log(`  FAIL  ${label}  (expected allowed, got ${e?.code || e?.message})`); return false; }
}
async function deny(label, p) {
  try { await p; fail++; failures.push(label); console.log(`  FAIL  ${label}  (expected PERMISSION_DENIED, was allowed)`); return false; }
  catch (e) {
    if (isDenied(e)) { pass++; console.log(`  ok    ${label}  [denied]`); return true; }
    fail++; failures.push(label); console.log(`  FAIL  ${label}  (wrong error: ${e?.code || e?.message})`); return false;
  }
}
const section = (t) => console.log(`\n== ${t}`);
const P = (c, path) => (path ? ref(c.db, path) : ref(c.db));
const text = (n, ch = 'x') => `${'Một cách xử lý khá cụ thể. '}${ch.repeat(n)}`.slice(0, Math.max(n, 30));
const ans = (c, extra = {}) => ({ text: 'Mình sẽ nói thẳng với bố mẹ và đưa ra phương án cụ thể.', ts: serverTimestamp(), t0: serverTimestamp(), ...extra });
const submit = (c, round, a = ans(c)) => update(P(c, ''), { [`${R(`answers/${round}/${c.uid}`)}`]: a, [`${R(`submitted/${round}/${c.uid}`)}`]: true });
const join = (c, name, team, extra = {}) => set(P(c, R(`players/${c.uid}`)), { name, team, joinedAt: serverTimestamp(), ...extra });

async function main() {
  console.log(`Rules test on ${EMU ? 'EMULATOR' : 'REAL DATABASE'}  room=${code}`);
  const host = await client('host');
  const [p1, p2, p3, p4, p5, tv, evil, c1, c2] = await Promise.all(['p1', 'p2', 'p3', 'p4', 'p5', 'tv', 'evil', 'c1', 'c2'].map(client));

  const settings = { mode: 'all', minChars: 20, maxChars: 800, graceMs: 3000, allowEdit: true, lockJoin: false, teams: defaultTeams(4) };
  const pubBase = () => ({ phase: 'lobby', roundId: 'r0', roundNo: 0, createdAt: serverTimestamp(), settings, timer: { state: 'idle', durationMs: 0 } });
  const setRound = (round, extra = {}) => update(P(host, R('public')), { phase: 'answering', roundId: round, question: { title: 'Tình huống', text: 'Nội dung' }, ...extra });
  const runTimer = (ms) => ({ state: 'running', durationMs: ms, endsAt: host.now() + ms });

  section('room creation and PIN secrecy');
  await deny('stranger cannot create hostUids without secret pin', set(P(evil, R(`hostUids/${evil.uid}`)), true));
  await allow('host creates room (hostUids + secret pin + public) in one update', update(P(host, ''), {
    [R(`hostUids/${host.uid}`)]: true, [`secrets/${code}/pin`]: PIN, [R('public')]: pubBase(),
  }));
  await deny('stranger cannot take over an existing room (write hostUids)', set(P(evil, R(`hostUids/${evil.uid}`)), true));
  await deny('stranger cannot overwrite the secret pin', set(P(evil, `secrets/${code}/pin`), '000000'));
  await deny('stranger cannot write public', set(P(evil, R('public/phase')), 'answering'));
  await deny('stranger cannot delete the room', remove(P(evil, R(''))));
  await deny('nobody can read the pin (stranger)', get(P(evil, `secrets/${code}/pin`)));
  await deny('nobody can read the pin (host)', get(P(host, `secrets/${code}/pin`)));
  await deny('nobody can read hostClaims', get(P(host, R('hostClaims'))));
  await deny('invalid pin format rejected for host rotate', set(P(host, `secrets/${code}/pin`), '12ab56'));
  await allow('any signed-in client (TV) reads public', get(P(tv, R('public'))));
  await deny('stranger cannot read the whole room', get(P(evil, R(''))));
  await deny('stranger cannot list rooms', get(P(evil, 'rooms')));
  await deny('stranger cannot list secrets', get(P(evil, 'secrets')));

  section('joining');
  await allow('p1 joins (Tổ 1)', join(p1, 'Lan Anh', 't1'));
  await allow('p2 joins (Tổ 2)', join(p2, 'Minh', 't2'));
  await allow('p3 joins (Tổ 1)', join(p3, 'Khôi', 't1'));
  await allow('p4 joins (Tổ 3)', join(p4, 'Hà', 't3'));
  await allow('p5 joins (Tổ 4)', join(p5, 'Bảo', 't4'));
  await deny('join with unknown tổ is rejected', join(evil, 'Evil', 't9'));
  await deny('join with 1-character name is rejected', join(evil, 'E', 't1'));
  await deny('join with 25-character name is rejected', join(evil, 'a'.repeat(25), 't1'));
  await deny('join with extra field is rejected', join(evil, 'Evil', 't1', { admin: true }));
  await deny('player cannot overwrite own record afterwards', join(p1, 'Tên khác', 't2'));
  await deny('player cannot write another player record', join(p1, 'Giả mạo', 't1').then(() => set(P(p1, R(`players/${p2.uid}`)), { name: 'X1', team: 't1', joinedAt: serverTimestamp() })));
  await allow('host renames a player', set(P(host, R(`players/${p3.uid}/name`)), 'Khôi Nguyên'));
  await allow('host moves a player to another tổ', set(P(host, R(`players/${p3.uid}/team`)), 't2'));
  await allow('host moves the player back', set(P(host, R(`players/${p3.uid}/team`)), 't1'));
  await allow('player reads roster', get(P(p1, R('players'))));
  await allow('player sets own presence', set(P(p1, R(`presence/${p1.uid}`)), true));
  await deny('non-joined client cannot set presence', set(P(tv, R(`presence/${tv.uid}`)), true));
  await deny('player cannot set another uid presence', set(P(p1, R(`presence/${p2.uid}`)), true));
  await allow('lock joins', set(P(host, R('public/settings/lockJoin')), true));
  await deny('join is rejected while the room is locked', join(evil, 'Muộn', 't1'));
  await allow('unlock joins', set(P(host, R('public/settings/lockJoin')), false));

  section('private data and public data separation');
  await allow('host writes private', set(P(host, R('private/script')), { opening: 'Xin chào' }));
  await deny('player cannot read private', get(P(p1, R('private'))));
  await deny('player cannot read private/script', get(P(p1, R('private/script'))));
  await deny('TV cannot read private', get(P(tv, R('private'))));
  await deny('player cannot write private', set(P(p1, R('private/script')), { x: 1 }));
  await allow('host reads private', get(P(host, R('private'))));
  await deny('player cannot write public', set(P(p1, R('public/question')), { text: 'hack' }));

  section('answers: only while answering, only in time');
  await deny('answer in lobby is rejected', submit(p1, 'r0'));
  await allow('host starts round r1 (timer 30 s)', setRound('r1', { timer: runTimer(30_000) }));
  await deny('player cannot start a round', set(P(p1, R('public/phase')), 'answering'));
  await allow('p1 submits answer + flag', submit(p1, 'r1'));
  await allow('p2 submits answer + flag', submit(p2, 'r1', ans(p2, { text: 'Câu trả lời khác của Minh, đủ dài để hợp lệ.' })));
  await deny('answer for a stale round id is rejected', submit(p3, 'r0'));
  await deny('answer under another uid is rejected', set(P(p3, R(`answers/r1/${p1.uid}`)), ans(p3)));
  await deny('non-joined client cannot answer', submit(tv, 'r1'));
  await deny('answer shorter than minChars is rejected', submit(p3, 'r1', ans(p3, { text: 'ngắn' })));
  await deny('answer longer than maxChars is rejected', submit(p3, 'r1', ans(p3, { text: 'a'.repeat(801) })));
  await deny('whitespace-only answer is rejected', submit(p3, 'r1', ans(p3, { text: ' '.repeat(30) })));
  await deny('forged timestamp is rejected', submit(p3, 'r1', ans(p3, { ts: 1 })));
  await deny('answer with extra field is rejected', submit(p3, 'r1', ans(p3, { score: 10 })));
  await deny('flag without an answer is rejected', set(P(p3, R(`submitted/r1/${p3.uid}`)), true));
  await deny('flag for another uid is rejected', set(P(p3, R(`submitted/r1/${p1.uid}`)), true));
  await deny('flag false is rejected', set(P(p1, R(`submitted/r1/${p1.uid}`)), false));
  await allow('author reads own answer', get(P(p1, R(`answers/r1/${p1.uid}`))));
  await deny("player cannot read another player's answer", get(P(p1, R(`answers/r1/${p2.uid}`))));
  await deny('player cannot read all answers', get(P(p1, R('answers/r1'))));
  await deny('TV cannot read answers', get(P(tv, R('answers/r1'))));
  await allow('host reads all answers', get(P(host, R('answers/r1'))));
  await allow('TV reads submitted flags (no content)', get(P(tv, R('submitted/r1'))));
  await allow('author edits own answer (allowEdit on) and keeps t0', (async () => {
    const t0 = (await get(P(p1, R(`answers/r1/${p1.uid}/t0`)))).val();
    await update(P(p1, R(`answers/r1/${p1.uid}`)), { text: 'Mình sửa lại: nói thẳng với bố mẹ và nhờ cô chủ nhiệm hỗ trợ.', ts: serverTimestamp(), t0 });
  })());
  await deny('edit that changes t0 is rejected', update(P(p1, R(`answers/r1/${p1.uid}`)), { text: 'Sửa nhưng đổi thời điểm nộp đầu tiên.', ts: serverTimestamp(), t0: 5 }));
  await allow('host disables edits', set(P(host, R('public/settings/allowEdit')), false));
  await deny('edit is rejected when allowEdit is off', update(P(p1, R(`answers/r1/${p1.uid}`)), { text: 'Sửa khi đã bị cấm sửa bài.', ts: serverTimestamp(), t0: 1 }));
  await allow('first submit still allowed when allowEdit is off', submit(p3, 'r1', ans(p3, { text: 'Bài đầu tiên của Khôi, nộp khi cấm sửa.' })));
  await allow('host re-enables edits', set(P(host, R('public/settings/allowEdit')), true));

  section('timer: pause and expiry');
  await allow('host pauses timer', set(P(host, R('public/timer')), { state: 'paused', durationMs: 30_000, remainingMs: 20_000 }));
  await allow('answer allowed while paused', submit(p4, 'r1', ans(p4, { text: 'Hà nộp lúc đồng hồ đang tạm dừng, vẫn hợp lệ.' })));
  await allow('host sets grace to 500 ms and resumes with 2.5 s left', update(P(host, R('public')), { 'settings/graceMs': 500, timer: runTimer(2500) }));
  await allow('answer allowed inside the window', submit(p5, 'r1', ans(p5, { text: 'Bảo nộp bài ngay trong thời gian cho phép.' })));
  await sleep(4200);
  await deny('edit after endsAt + grace is rejected', update(P(p5, R(`answers/r1/${p5.uid}`)), { text: 'Sửa bài sau khi hết giờ đã quá thời gian.', ts: serverTimestamp(), t0: 1 }));
  await deny('new answer after endsAt + grace is rejected', submit(evil, 'r1'));
  await allow('host locks the round', set(P(host, R('public/phase')), 'locked'));
  await deny('answer in locked phase is rejected', submit(evil, 'r1'));

  section('team mode: only the tổ representative submits');
  await allow('host switches to team mode and opens round r2', update(P(host, R('public')), { phase: 'answering', roundId: 'r2', 'settings/mode': 'team', 'settings/graceMs': 3000, timer: runTimer(60_000) }));
  await allow('p1 claims representative of Tổ 1', set(P(p1, R('reps/t1')), p1.uid));
  await deny('p3 (also Tổ 1) cannot claim an occupied slot', set(P(p3, R('reps/t1')), p3.uid));
  await deny('p4 (Tổ 3) cannot claim Tổ 1', set(P(p4, R('reps/t1')), p4.uid));
  await deny('p4 cannot claim a slot for another uid', set(P(p4, R('reps/t3')), p1.uid));
  await allow('p2 claims representative of Tổ 2', set(P(p2, R('reps/t2')), p2.uid));
  await deny('non-representative cannot submit', submit(p3, 'r2'));
  await allow('representative submits', submit(p1, 'r2'));
  await allow('host reassigns the Tổ 1 representative to p3', set(P(host, R('reps/t1')), p3.uid));
  await deny('previous representative can no longer submit', submit(p1, 'r2', ans(p1, { text: 'Bài sửa của đại diện cũ, không còn hợp lệ.' })));
  await allow('new representative submits', submit(p3, 'r2', ans(p3, { text: 'Bài của đại diện mới sau khi Host đổi người.' })));
  await allow('host back to whole-class mode', set(P(host, R('public/settings/mode')), 'all'));

  section('voting: one per uid, only while open, never for own option');
  await allow('host sets author mapping (private) and opens voting for r2', update(P(host, ''), {
    [R(`private/optionOf/r2/${p1.uid}`)]: 0, [R(`private/optionOf/r2/${p2.uid}`)]: 1,
    [R('public/phase')]: 'voting', [R('public/vote')]: { open: false, count: 2 },
  }));
  await deny('vote before voting is open is rejected', set(P(p3, R(`votes/r2/${p3.uid}`)), 0));
  await allow('host opens voting', set(P(host, R('public/vote/open')), true));
  await deny('vote for own option is rejected (p1 -> option 0)', set(P(p1, R(`votes/r2/${p1.uid}`)), 0));
  await allow('vote for another option is accepted (p1 -> option 1)', set(P(p1, R(`votes/r2/${p1.uid}`)), 1));
  await deny('p2 cannot vote for own option 1', set(P(p2, R(`votes/r2/${p2.uid}`)), 1));
  await allow('p2 votes option 0', set(P(p2, R(`votes/r2/${p2.uid}`)), 0));
  await allow('voter with no option of their own votes', set(P(p4, R(`votes/r2/${p4.uid}`)), 0));
  await deny('vote out of range is rejected', set(P(p5, R(`votes/r2/${p5.uid}`)), 5));
  await deny('negative vote is rejected', set(P(p5, R(`votes/r2/${p5.uid}`)), -1));
  await deny('non-numeric vote is rejected', set(P(p5, R(`votes/r2/${p5.uid}`)), 'abc'));
  await deny('vote under another uid is rejected', set(P(p5, R(`votes/r2/${p4.uid}`)), 1));
  await deny('vote on a stale round is rejected', set(P(p5, R(`votes/r1/${p5.uid}`)), 0));
  await deny('non-joined client cannot vote', set(P(tv, R(`votes/r2/${tv.uid}`)), 0));
  await allow('voter reads own vote', get(P(p1, R(`votes/r2/${p1.uid}`))));
  await deny("voter cannot read another's vote", get(P(p1, R(`votes/r2/${p2.uid}`))));
  await deny('voter cannot read all votes', get(P(p1, R('votes/r2'))));
  await allow('host reads all votes', get(P(host, R('votes/r2'))));
  await allow('host closes voting', set(P(host, R('public/vote/open')), false));
  await deny('vote after close is rejected', set(P(p5, R(`votes/r2/${p5.uid}`)), 0));
  await deny('vote in another phase is rejected', update(P(host, R('public')), { phase: 'scoring', 'vote/open': true }).then(() => set(P(p5, R(`votes/r2/${p5.uid}`)), 0)));

  section('ban: every write from a banned uid is rejected');
  await allow('host starts round r3', setRound('r3', { timer: runTimer(60_000), 'vote/open': false }));
  await allow('host bans p2 (record kept to prove the ban itself blocks writes)', set(P(host, R(`banned/${p2.uid}`)), true));
  await deny('banned uid cannot answer', submit(p2, 'r3'));
  await deny('banned uid cannot vote', set(P(p2, R(`votes/r3/${p2.uid}`)), 0));
  await deny('banned uid cannot set presence', set(P(p2, R(`presence/${p2.uid}`)), true));
  await deny('banned uid cannot claim a representative slot', set(P(p2, R('reps/t2')), p2.uid));
  await deny('banned uid cannot guess the PIN', update(P(p2, R('')), { [`hostClaims/${p2.uid}`]: PIN, [`claimTries/${p2.uid}`]: 1 }));
  await deny('banned uid cannot unban itself', remove(P(p2, R(`banned/${p2.uid}`))));
  await deny('banned uid cannot re-join under a new record', set(P(p2, R(`players/${p2.uid}`)), { name: 'Lại', team: 't1', joinedAt: serverTimestamp() }));
  await allow('control: a not-banned player answers in the same round', submit(p5, 'r3'));
  await allow('banned uid can still read its own ban flag', get(P(p2, R(`banned/${p2.uid}`))));
  await deny('player cannot read the ban list', get(P(p1, R('banned'))));

  section('host PIN claim: brute force is capped, only the right PIN works');
  await deny('claim without bumping the counter is rejected', set(P(c1, R(`hostClaims/${c1.uid}`)), '000000'));
  await allow('wrong guess #1 is recorded (counter 1)', update(P(c1, R('')), { [`hostClaims/${c1.uid}`]: '000000', [`claimTries/${c1.uid}`]: 1 }));
  await deny('a wrong claim does not make c1 a host', set(P(c1, R(`hostUids/${c1.uid}`)), true));
  await deny('c1 still cannot read private', get(P(c1, R('private'))));
  await deny('c1 still cannot write public', set(P(c1, R('public/phase')), 'lobby'));
  await deny('counter cannot jump', update(P(c1, R('')), { [`hostClaims/${c1.uid}`]: '111111', [`claimTries/${c1.uid}`]: 5 }));
  await deny('malformed claim is rejected', update(P(c1, R('')), { [`hostClaims/${c1.uid}`]: 'abcdef', [`claimTries/${c1.uid}`]: 2 }));
  await allow('c1 reads its own counter', get(P(c1, R(`claimTries/${c1.uid}`))));
  await deny("c1 cannot read c2's counter", get(P(c1, R(`claimTries/${c2.uid}`))));
  await allow('right PIN is accepted as a claim (counter 2)', update(P(c1, R('')), { [`hostClaims/${c1.uid}`]: PIN, [`claimTries/${c1.uid}`]: 2 }));
  await allow('after a valid claim c1 adds itself to hostUids', set(P(c1, R(`hostUids/${c1.uid}`)), true));
  await allow('c1 (now host) reads private', get(P(c1, R('private'))));
  await allow('c1 (now host) writes public', set(P(c1, R('public/settings/lockJoin')), false));
  await deny('c1 still cannot read the pin', get(P(c1, `secrets/${code}/pin`)));
  for (let i = 1; i <= 8; i++) {
    await allow(`c2 wrong guess #${i}`, update(P(c2, R('')), { [`hostClaims/${c2.uid}`]: String(100000 + i), [`claimTries/${c2.uid}`]: i }));
  }
  await deny('c2 guess #9 is rejected (cap of 8 per uid)', update(P(c2, R('')), { [`hostClaims/${c2.uid}`]: PIN, [`claimTries/${c2.uid}`]: 9 }));
  await deny('c2 cannot become host after exhausting its tries', set(P(c2, R(`hostUids/${c2.uid}`)), true));

  section('cleanup');
  await deny('non-host cannot delete the room', remove(P(p1, R(''))));
  await allow('host deletes room and secret in one update', update(P(host, ''), { [R('')]: null, [`secrets/${code}`]: null }));
  const gone = await get(P(host, R('public')));
  if (gone.exists()) { fail++; failures.push('room data still present after delete'); console.log('  FAIL  room data still present after delete'); }
  else { pass++; console.log('  ok    room is gone'); }
}


// Same flows again, but with the EXACT payload builders the app uses (js/lib/room-ops.js).
async function appPayloads() {
  code = generateCode();
  const host = await client('ahost');
  const [pa, pb, pc, stranger] = await Promise.all(['pa', 'pb', 'pc', 'stranger'].map(client));
  const ts = serverTimestamp();
  section('app payloads: create -> join -> start -> submit -> lock -> kick -> end');
  await allow('createRoomUpdates', update(P(host, ''), ops.createRoomUpdates({ code, uid: host.uid, pin: PIN, ts: serverTimestamp() })));
  await allow('joinRecord (pa, Tổ 1)', set(P(pa, R(`players/${pa.uid}`)), ops.joinRecord({ name: 'Lan', team: 't1', ts: serverTimestamp() })));
  await allow('joinRecord (pb, Tổ 2)', set(P(pb, R(`players/${pb.uid}`)), ops.joinRecord({ name: 'Minh', team: 't2', ts: serverTimestamp() })));
  await allow('joinRecord (pc, Tổ 1)', set(P(pc, R(`players/${pc.uid}`)), ops.joinRecord({ name: 'Bảo', team: 't1', ts: serverTimestamp() })));
  const q = { id: 'b1', title: 'Y Dược hay thiết kế', text: 'Nội dung tình huống.', criteria: ['a', 'b'] };
  const start = ops.startRoundUpdates({ code, roundNo: 0, question: q, durationMs: 20_000, nowServer: host.now() });
  await allow('startRoundUpdates', update(P(host, ''), start.updates));
  await allow('submitUpdates (first submit, t0 = server time)', update(P(pa, ''), ops.submitUpdates({ code, roundId: start.roundId, uid: pa.uid, text: 'Mình sẽ nói chuyện với bố mẹ trước.', ts: serverTimestamp(), t0: undefined })).catch((e) => { throw e; }));
  await allow('submitUpdates (edit keeps t0)', (async () => {
    const t0 = (await get(P(pa, R(`answers/${start.roundId}/${pa.uid}/t0`)))).val();
    await update(P(pa, ''), ops.submitUpdates({ code, roundId: start.roundId, uid: pa.uid, text: 'Mình sửa lại: nói chuyện với bố mẹ và cô chủ nhiệm.', ts: serverTimestamp(), t0 }));
  })());
  await allow('extendTimerUpdate (+30 s)', update(P(host, ''), ops.extendTimerUpdate({ code, timer: start.updates[R('public/timer')], addMs: 30_000, nowServer: host.now() })));
  await allow('pauseTimerUpdate', (async () => {
    const t = (await get(P(host, R('public/timer')))).val();
    await update(P(host, ''), ops.pauseTimerUpdate({ code, timer: t, nowServer: host.now() }));
  })());
  await allow('resumeTimerUpdate', (async () => {
    const t = (await get(P(host, R('public/timer')))).val();
    await update(P(host, ''), ops.resumeTimerUpdate({ code, timer: t, nowServer: host.now() }));
  })());
  await allow('lockUpdates', update(P(host, ''), ops.lockUpdates({ code })));
  await deny('player cannot answer after lockUpdates', update(P(pb, ''), ops.submitUpdates({ code, roundId: start.roundId, uid: pb.uid, text: 'Mình nộp muộn sau khi Host đã khoá bài.', ts: serverTimestamp() })));
  await allow('reopenUpdates (60 s)', update(P(host, ''), ops.reopenUpdates({ code, durationMs: 60_000, nowServer: host.now() })));
  await allow('player answers again after reopen', update(P(pb, ''), ops.submitUpdates({ code, roundId: start.roundId, uid: pb.uid, text: 'Mình nộp sau khi Host mở lại phần nộp bài.', ts: serverTimestamp() })));
  await allow('rep slot claim by pc, kick of the rep clears it', set(P(pc, R('reps/t1')), pc.uid));
  await allow('kickUpdates (ban + remove roster + presence + rep slot)', (async () => {
    await set(P(pc, R(`presence/${pc.uid}`)), true);
    await update(P(host, ''), ops.kickUpdates({ code, uid: pc.uid, teamId: 't1', repUid: pc.uid }));
  })());
  const after = await get(P(host, R(`players/${pc.uid}`)));
  const banned = await get(P(host, R(`banned/${pc.uid}`)));
  const rep = await get(P(host, R('reps/t1')));
  if (!after.exists() && banned.val() === true && !rep.exists()) { pass++; console.log('  ok    kicked player is gone, banned, rep slot freed'); }
  else { fail++; failures.push('kick result'); console.log('  FAIL  kick result'); }
  await deny('kicked uid cannot re-join', set(P(pc, R(`players/${pc.uid}`)), ops.joinRecord({ name: 'Lại', team: 't1', ts: serverTimestamp() })));
  await allow('backToLobbyUpdates', update(P(host, ''), ops.backToLobbyUpdates({ code })));
  await deny('stranger: claimGuess then hostUids with a wrong PIN', (async () => {
    await update(P(stranger, ''), ops.claimGuessUpdates({ code, uid: stranger.uid, pin: '000001', tries: 0 }));
    await set(P(stranger, R(`hostUids/${stranger.uid}`)), true);
  })());
  await allow('stranger: claimGuessUpdates with the right PIN, then hostUids', (async () => {
    await update(P(stranger, ''), ops.claimGuessUpdates({ code, uid: stranger.uid, pin: PIN, tries: 1 }));
    await set(P(stranger, R(`hostUids/${stranger.uid}`)), true);
  })());
  await deny('non-host player cannot end the room', update(P(pa, ''), ops.endRoomUpdates({ code })));
  await allow('endRoomUpdates (new host from PIN claim can end it)', update(P(stranger, ''), ops.endRoomUpdates({ code })));
  const gone = await get(P(host, R('public')));
  if (!gone.exists()) { pass++; console.log('  ok    room is gone'); } else { fail++; failures.push('app payload room not deleted'); console.log('  FAIL  room still exists'); }
}


// ================================================================================================
// Stage 2: every new write path (settings, tổ, bank, review, AI import, showcase, voting, scores, awards,
// adjustments, reveal, board, bans, reps) with the exact payloads the app builds.
// ================================================================================================
async function stage2() {
  code = generateCode();
  const host = await client('s2host');
  const [h2, p1, p2, p3, p4, tv, evil] = await Promise.all(['s2h2', 's2p1', 's2p2', 's2p3', 's2p4', 's2tv', 's2evil'].map(client));
  const root = (c) => P(c, '');
  const tx = (c) => ({ runTransaction, ref: P(c, R('public')) });
  const pending = (c, action, args) => runTransition(tx(c), action, args);
  const okT = async (label, c, action, args) => { const r = await pending(c, action, args); if (r.ok) { pass++; console.log(`  ok    ${label}`); } else { fail++; failures.push(label); console.log(`  FAIL  ${label}  (${r.error})`); } return r; };
  const refT = async (label, c, action, args, why) => { const r = await pending(c, action, args); if (!r.ok && (!why || r.error === why)) { pass++; console.log(`  ok    ${label}  [refused: ${r.error}]`); } else { fail++; failures.push(label); console.log(`  FAIL  ${label}  (${r.ok ? 'applied' : r.error})`); } };

  await allow('create room with the app payload', update(root(host), ops.createRoomUpdates({ code, uid: host.uid, pin: PIN, ts: serverTimestamp() })));
  await allow('second device claims host with the PIN', (async () => {
    await update(root(h2), ops.claimGuessUpdates({ code, uid: h2.uid, pin: PIN, tries: 0 }));
    await set(P(h2, R(`hostUids/${h2.uid}`)), true);
  })());
  await allow('p1 joins Tổ 1', set(P(p1, R(`players/${p1.uid}`)), ops.joinRecord({ name: 'An', team: 't1', ts: serverTimestamp() })));
  await allow('p2 joins Tổ 1', set(P(p2, R(`players/${p2.uid}`)), ops.joinRecord({ name: 'Bình', team: 't1', ts: serverTimestamp() })));
  await allow('p3 joins Tổ 2', set(P(p3, R(`players/${p3.uid}`)), ops.joinRecord({ name: 'Chi', team: 't2', ts: serverTimestamp() })));
  await allow('p4 joins Tổ 4', set(P(p4, R(`players/${p4.uid}`)), ops.joinRecord({ name: 'Dũng', team: 't4', ts: serverTimestamp() })));

  section('S2 settings: ranges are enforced by the rules');
  const setting = (c, key, value) => update(root(c), { [R(`public/settings/${key}`)]: value });
  for (const [k, v] of [['maxScore', 20], ['scoreStep', 1], ['formula', 'mix'], ['voteWeight', 30], ['awardTop', 3], ['teamAward', 'place'], ['tvSize', 'XL'], ['tvTheme', 'dark'], ['tvSound', true], ['tvQr', false],
    ['aiN', 5], ['aiHideNames', true], ['aiCriteria', false], ['phoneVoting', false], ['liveTally', true], ['addMs', 15000], ['defaultSecs', 90], ['minChars', 10], ['maxChars', 500], ['graceMs', 2000], ['autoSubmit', false], ['mode', 'team']]) {
    await allow(`host sets ${k} = ${v}`, setting(host, k, v));
  }
  await allow('settingUpdate builder output is accepted', update(root(host), ops.settingUpdate({ code, key: 'maxScore', value: '100' })));
  for (const [k, v] of [['maxScore', 0], ['maxScore', 1001], ['maxScore', 'mười'], ['scoreStep', 0.7], ['formula', 'median'], ['voteWeight', 120], ['awardTop', 2], ['teamAward', 'all'],
    ['tvSize', 'XXL'], ['tvTheme', 'blue'], ['tvSound', 'yes'], ['aiN', 20], ['aiN', 0], ['minChars', 0], ['maxChars', 5000], ['graceMs', 60000], ['mode', 'solo'], ['lockJoin', 1]]) {
    await deny(`host cannot set ${k} = ${JSON.stringify(v)}`, setting(host, k, v));
  }
  check_(ops.settingUpdate({ code, key: 'maxScore', value: 0 }) !== null, 'settingUpdate clamps 0 to 1 (so the UI never sends an invalid value)');
  check_(ops.settingUpdate({ code, key: 'formula', value: 'median' }) === null, 'settingUpdate refuses an unknown formula');
  await deny('player cannot change a setting', setting(p1, 'maxScore', 5));
  await deny('TV cannot change a setting', setting(tv, 'maxScore', 5));
  await allow('restore defaults', update(root(host), { [R('public/settings')]: { ...DEFAULT_SETTINGS, teams: defaultTeams(4) } }));
  await allow('host adds profanity words', update(root(host), ops.badWordsUpdate({ code, words: ['từ xấu', 'abc def'] })));
  await deny('profanity word of 1 character is rejected', update(root(host), { [R('public/settings/badWords')]: ['x'] }));
  await deny('player cannot add profanity words', update(root(p1), ops.badWordsUpdate({ code, words: ['hack'] })));
  await allow('player reads the words (public)', get(P(p1, R('public/settings/badWords'))));

  section('S2 tổ: count, names, move, representatives');
  await allow('rename tổ', set(P(host, R('public/settings/teams/t1/name')), 'Tổ Sao'));
  await deny('tổ name of 21 characters is rejected', set(P(host, R('public/settings/teams/t2/name')), 'x'.repeat(21)));
  await deny('tổ t7 cannot exist', set(P(host, R('public/settings/teams/t7')), { name: 'Tổ 7' }));
  await deny('player cannot rename a tổ', set(P(p1, R('public/settings/teams/t1/name')), 'Hack'));
  await allow('host renames a player (renamePlayerUpdates)', update(root(host), ops.renamePlayerUpdates({ code, uid: p2.uid, name: 'Bình An' })));
  await deny('host cannot rename to 1 character', update(root(host), ops.renamePlayerUpdates({ code, uid: p2.uid, name: 'B' })));
  await allow('second host moves p2 to Tổ 2 (movePlayerUpdates)', update(root(h2), ops.movePlayerUpdates({ code, uid: p2.uid, team: 't2' })));
  await deny('move to a missing tổ is rejected', update(root(host), ops.movePlayerUpdates({ code, uid: p2.uid, team: 't9' })));
  await deny('player cannot move another player', update(root(p1), ops.movePlayerUpdates({ code, uid: p3.uid, team: 't1' })));
  await allow('host assigns a representative (repUpdates)', update(root(host), ops.repUpdates({ code, teamId: 't2', uid: p3.uid })));
  await allow('host reassigns the representative', update(root(h2), ops.repUpdates({ code, teamId: 't2', uid: p2.uid })));
  await allow('host clears the representative', update(root(host), ops.repUpdates({ code, teamId: 't2', uid: null })));
  await deny('player cannot assign a representative for another uid', update(root(p1), ops.repUpdates({ code, teamId: 't1', uid: p2.uid })));
  await allow('p3 reads reps', get(P(p3, R('reps'))));
  await allow('shrink to 2 tổ: teams + moves + rep clean-up in one update', (async () => {
    const players = (await get(P(host, R('players')))).val();
    const { teams, moves } = resizeTeams((await get(P(host, R('public/settings/teams')))).val(), players, 2);
    await update(root(host), ops.teamsUpdates({ code, teams, moves }));
  })());
  const dung = (await get(P(host, R(`players/${p4.uid}`)))).val();
  check_(dung.team === 't1', 'the player of the removed Tổ 4 now sits in Tổ 1');
  await allow('grow back to 4 tổ', update(root(host), ops.teamsUpdates({ code, teams: defaultTeams(4), moves: [] })));
  await allow('p4 goes back to Tổ 4', update(root(host), ops.movePlayerUpdates({ code, uid: p4.uid, team: 't4' })));

  section('S2 private paths: bank, review, order, aid, ai, optionOf, hand, awards, adjust');
  const priv = (c, path, v) => set(P(c, R(`private/${path}`)), v);
  await allow('host stores the question bank', update(root(host), ops.bankUpdate({ code, bank: defaultBank() })));
  await deny('bank entry with a 5-second default time is rejected', priv(host, 'bank/0', { id: 'x', title: 'T', text: 'N'.repeat(30), time: 5 }));
  await deny('bank entry with an 81-character title is rejected', priv(host, 'bank/0', { id: 'x', title: 'T'.repeat(81), text: 'N'.repeat(30), time: 90 }));
  await deny('bank entry missing the text is rejected', priv(host, 'bank/0', { id: 'x', title: 'T', time: 90 }));
  await deny('player cannot read the bank', get(P(p1, R('private/bank'))));
  await deny('player cannot write the bank', priv(p1, 'bank/0', { id: 'x', title: 'T', text: 'N'.repeat(30), time: 90 }));
  await allow('second host reads the bank', get(P(h2, R('private/bank'))));

  await allow('review: choose an answer with highlight and AI score (reviewUpdates)', update(root(host), ops.reviewUpdates({ code, roundId: 'r1', uid: p1.uid, patch: { st: 'chosen', hl: 'Nổi bật', ai: 8.5, score: 8.5, reason: 'Tốt' } })));
  await allow('review: display-text edit keeps the original (edit is a separate field)', update(root(host), ops.reviewUpdates({ code, roundId: 'r1', uid: p1.uid, patch: { edit: 'Bản đã sửa lỗi chính tả.' } })));
  await allow('review: clear the choice', update(root(host), ops.reviewUpdates({ code, roundId: 'r1', uid: p1.uid, patch: { st: null } })));
  await deny('review: unknown state is rejected', update(root(host), ops.reviewUpdates({ code, roundId: 'r1', uid: p1.uid, patch: { st: 'maybe' } })));
  await deny('review: score above 1000 is rejected', update(root(host), ops.reviewUpdates({ code, roundId: 'r1', uid: p1.uid, patch: { score: 2000 } })));
  await deny('review: negative score is rejected', update(root(host), ops.scoreUpdate({ code, roundId: 'r1', uid: p1.uid, score: -1 })));
  await deny('review: extra field is rejected', update(root(host), ops.reviewUpdates({ code, roundId: 'r1', uid: p1.uid, patch: { admin: true } })));
  await allow('review: score update (scoreUpdate)', update(root(host), ops.scoreUpdate({ code, roundId: 'r1', uid: p1.uid, score: 9 })));
  await deny('player cannot read review', get(P(p1, R('private/review'))));
  await deny('player cannot write a score', update(root(p1), ops.scoreUpdate({ code, roundId: 'r1', uid: p1.uid, score: 10 })));
  await allow('order (orderUpdate)', update(root(host), ops.orderUpdate({ code, roundId: 'r1', order: [p1.uid, p2.uid] })));
  await deny('order with a non-string entry is rejected', priv(host, 'order/r1/0', 5));
  await allow('answer ids (aidUpdate)', update(root(host), ops.aidUpdate({ code, roundId: 'r1', map: { [p1.uid]: 'P01', [p2.uid]: 'P02' } })));
  await deny('answer id in a wrong format is rejected', priv(host, `aid/r1/${p1.uid}`, 'Q1'));
  const parsed = { status: 'json', raw: '```json {} ```', selected: [{ id: 'P01', highlight: 'Nổi bật', suggestedScore: 8, reason: 'Tốt' }], rejected: [{ id: 'P02', reason: 'Đùa' }], script: { opening: 'Mở', perOption: [{ id: 'P01', speech: 'Nói' }], closing: 'Kết' }, foundIds: [], warnings: [] };
  await allow('AI import: selection + scores + order + script in one update (aiImportUpdates)', update(root(host), ops.aiImportUpdates({ code, roundId: 'r1', parsed, uidOf: { P01: p1.uid, P02: p2.uid }, at: serverTimestamp() })));
  await allow('AI import of free text (no script) is accepted', update(root(host), ops.aiImportUpdates({ code, roundId: 'r1', parsed: { ...parsed, status: 'free', script: null, selected: [], rejected: [], foundIds: ['P01'], warnings: [{ text: 'w' }] }, uidOf: { P01: p1.uid }, at: serverTimestamp() })));
  await deny('AI raw text over 60 000 characters is rejected', priv(host, 'ai/r1/raw', 'x'.repeat(60001)));
  await deny('player cannot read the AI result or script', get(P(p1, R('private/ai'))));
  await allow('option mapping, whole class (optionOfUpdates)', update(root(host), ops.optionOfUpdates({ code, roundId: 'r1', options: [{ uid: p1.uid, team: 't1' }, { uid: p3.uid, team: 't2' }], players: {}, mode: 'all' })));
  await deny('option index 12 is rejected', priv(host, `optionOf/r1/${p4.uid}`, 12));
  await deny('player cannot read optionOf (would reveal authors)', get(P(p1, R('private/optionOf'))));
  await deny('player cannot write optionOf', priv(p1, `optionOf/r1/${p1.uid}`, 1));
  await allow('hand count +1 (atomic increment)', update(root(host), ops.handUpdate({ code, roundId: 'r1', option: 0, delta: 1, inc: increment })));
  await allow('hand count +1 from the second host', update(root(h2), ops.handUpdate({ code, roundId: 'r1', option: 0, delta: 1, inc: increment })));
  check_((await get(P(host, R('private/hand/r1/0')))).val() === 2, 'two hosts incrementing at once: both counted');
  await allow('hand count -1', update(root(host), ops.handUpdate({ code, roundId: 'r1', option: 0, delta: -1, inc: increment })));
  await allow('hand count back to 0', update(root(host), ops.handUpdate({ code, roundId: 'r1', option: 0, delta: -1, inc: increment })));
  await deny('hand count cannot go below 0', update(root(host), ops.handUpdate({ code, roundId: 'r1', option: 0, delta: -1, inc: increment })));
  await deny('player cannot change hand counts', update(root(p1), ops.handUpdate({ code, roundId: 'r1', option: 1, delta: 1, inc: increment })));
  await deny('adjustment to a missing tổ id is rejected', update(root(host), ops.adjustUpdate({ code, key: 'k0', team: 't9', delta: 1, at: serverTimestamp() })));
  await deny('adjustment of +5000 is rejected', update(root(host), ops.adjustUpdate({ code, key: 'k0', team: 't1', delta: 5000, at: serverTimestamp() })));
  await allow('manual adjustment +2 with a note (adjustUpdate)', update(root(host), ops.adjustUpdate({ code, key: 'k1', team: 't1', delta: 2, at: serverTimestamp(), note: 'Giúp bạn' })));
  await allow('manual adjustment -1', update(root(h2), ops.adjustUpdate({ code, key: 'k2', team: 't2', delta: -1, at: serverTimestamp() })));
  await deny('player cannot adjust points', update(root(p1), ops.adjustUpdate({ code, key: 'k3', team: 't1', delta: 100, at: serverTimestamp() })));
  await deny('player cannot read the adjustment log', get(P(p1, R('private/adjust'))));
  await deny('award without "at" or "items" is rejected', priv(host, 'awards/r1', { x: 1 }));
  await deny('player cannot write an award', priv(p1, 'awards/r1', { at: 1, items: [] }));

  section('S2 phases through the real rules: transaction on public, the same code the app runs');
  await allow('set tổ mode off, normal limits', update(root(host), { [R('public/settings/mode')]: 'all', [R('public/settings/minChars')]: 20, [R('public/settings/maxChars')]: 800, [R('public/settings/graceMs')]: 3000 }));
  const q = { id: 'b1', title: 'Y Dược hay thiết kế', text: 'Nội dung tình huống đủ dài để hợp lệ.' };
  await refT('player cannot start a round (rules refuse the transaction write)', p1, A.START, { question: q, durationMs: 60_000, now: p1.now() }, 'aborted').catch(() => {});
  const started = await okT('host starts the round (transaction)', host, A.START, { question: q, durationMs: 60_000, now: host.now() });
  const rid = started.pub?.roundId;
  check_(rid === 'r1', `round id r1 (got ${rid})`);
  // two answers (host-written, as an admin seed would) so the showcase has real authors
  await allow('p1 submits', update(root(p1), ops.submitUpdates({ code, roundId: rid, uid: p1.uid, text: 'Mình sẽ nói chuyện thẳng với bố mẹ và đưa ra bảng so sánh.', ts: serverTimestamp() })));
  await allow('p3 submits', update(root(p3), ops.submitUpdates({ code, roundId: rid, uid: p3.uid, text: 'Mình thử làm một dự án thiết kế nhỏ trong ba ngày.', ts: serverTimestamp() })));
  await allow('p4 submits', update(root(p4), ops.submitUpdates({ code, roundId: rid, uid: p4.uid, text: 'Mình hỏi cô hướng nghiệp trước khi nói với bố mẹ.', ts: serverTimestamp() })));
  const [l1, l2] = await Promise.all([pending(host, A.LOCK, {}), pending(h2, A.LOCK, {})]);
  check_([l1, l2].filter((r) => r.ok).length === 1, 'TWO HOSTS lock at the same moment: exactly one transaction wins');
  check_([l1, l2].filter((r) => !r.ok).every((r) => r.error === 'wrongPhase'), 'the other host is told the phase already changed');
  await refT('locking again is refused (stale button on the second device)', h2, A.LOCK, {}, 'wrongPhase');
  await okT('second host moves to reviewing', h2, A.REVIEW, {});
  await refT('showcase with no items is refused', host, A.SHOWCASE, { items: [] }, 'noItems');
  const items = [{ text: 'Mình sẽ nói chuyện thẳng với bố mẹ và đưa ra bảng so sánh.', hl: 'Nói thẳng, có bảng so sánh' }, { text: 'Mình thử làm một dự án thiết kế nhỏ trong ba ngày.', hl: '' }, { text: 'Mình hỏi cô hướng nghiệp trước.', hl: 'Hỏi người có kinh nghiệm' }];
  await okT('showcase pushed to everybody (names stay out)', host, A.SHOWCASE, { items });
  const sc = (await get(P(p2, R('public/showcase')))).val();
  check_(sc.items.length === 3 && !JSON.stringify(sc).includes(p1.uid), 'a player reads the showcase: text + highlight, no uid');
  await allow('focus option 1 on the TV (focusUpdate)', update(root(host), ops.focusUpdate({ code, focus: 1 })));
  await deny('focus on option 99 is rejected', update(root(host), ops.focusUpdate({ code, focus: 99 })));
  await allow('quick edit: push edited items (showcaseItemsUpdate)', update(root(host), ops.showcaseItemsUpdate({ code, items: items.map((it) => ({ ...it, text: it.text + ' (sửa)' })) })));
  await deny('showcase item over 2000 characters is rejected', update(root(host), ops.showcaseItemsUpdate({ code, items: [{ text: 'x'.repeat(2001), hl: '' }] })));
  await deny('showcase item with an extra field (author) is rejected', update(root(host), ops.showcaseItemsUpdate({ code, items: [{ text: 'ok', hl: '', uid: p1.uid }] })));
  await deny('player cannot write the showcase', update(root(p1), ops.showcaseItemsUpdate({ code, items })));
  await allow('TV reads the showcase', get(P(tv, R('public/showcase'))));
  await allow('author mapping for voting (options 0,1,2 = p1,p3,p4)', update(root(host), ops.optionOfUpdates({ code, roundId: rid, options: [{ uid: p1.uid, team: 't1' }, { uid: p3.uid, team: 't2' }, { uid: p4.uid, team: 't4' }], players: {}, mode: 'all' })));

  section('S2 voting through the phase machine (phone voting + live tally + hand raise)');
  await okT('open voting with phone voting and live tally', host, A.OPEN_VOTING, { phone: true, live: true });
  await allow('p1 votes option 1', set(P(p1, R(`votes/${rid}/${p1.uid}`)), 1));
  await deny('p1 cannot vote for own option 0', set(P(p1, R(`votes/${rid}/${p1.uid}`)), 0));
  await allow('p1 changes the vote to option 2 (still one vote per uid)', set(P(p1, R(`votes/${rid}/${p1.uid}`)), 2));
  await deny('p3 cannot vote for own option 1', set(P(p3, R(`votes/${rid}/${p3.uid}`)), 1));
  await allow('p3 votes option 0', set(P(p3, R(`votes/${rid}/${p3.uid}`)), 0));
  await allow('p2 (no option) votes option 2', set(P(p2, R(`votes/${rid}/${p2.uid}`)), 2));
  await deny('vote for option 3 (only 3 options) is rejected', set(P(p2, R(`votes/${rid}/${p2.uid}`)), 3));
  await allow('host publishes the live tally (tallyUpdate)', update(root(host), ops.tallyUpdate({ code, tally: [1, 0, 2], n: 3 })));
  await deny('tally with a negative count is rejected', update(root(host), ops.tallyUpdate({ code, tally: [-1, 0, 2], n: 3 })));
  await deny('player cannot write the tally', update(root(p1), ops.tallyUpdate({ code, tally: [9, 9, 9], n: 9 })));
  await allow('TV reads the live tally', get(P(tv, R('public/vote/tally'))));
  await allow('host reads every vote', get(P(host, R(`votes/${rid}`))));
  await okT('host closes phone voting (setVoteOpen)', h2, A.SET_VOTE_OPEN, { open: false });
  await deny('vote after the host closed voting is rejected', set(P(p4, R(`votes/${rid}/${p4.uid}`)), 0));
  await okT('reopen phone voting', host, A.SET_VOTE_OPEN, { open: true });
  await allow('vote is accepted again', set(P(p4, R(`votes/${rid}/${p4.uid}`)), 0));
  await okT('going back to the showcase clears the vote state', host, A.BACK_SHOWCASE, {});
  await allow('votes and hand counts cleared (clearVotesUpdates)', update(root(host), ops.clearVotesUpdates({ code, roundId: rid })));
  check_(!(await get(P(host, R(`votes/${rid}`)))).exists(), 'old votes are gone after going back');
  await deny('vote while the phase is showcase is rejected', set(P(p4, R(`votes/${rid}/${p4.uid}`)), 0));

  section('S2 team mode: tổ-mates of an author cannot vote for their tổ');
  await allow('team-mode mapping adds the author’s tổ-mates (optionOfUpdates, mode team)', update(root(host), ops.optionOfUpdates({
    code, roundId: rid, mode: 'team',
    options: [{ uid: p1.uid, team: 't1' }, { uid: p3.uid, team: 't2' }, { uid: p4.uid, team: 't4' }],
    players: { [p1.uid]: { team: 't1' }, [p2.uid]: { team: 't2' }, [p3.uid]: { team: 't2' }, [p4.uid]: { team: 't4' } },
  })));
  await okT('open voting again', host, A.OPEN_VOTING, { phone: true });
  await deny('p2 is in the same tổ as author p3 (option 1): cannot vote option 1', set(P(p2, R(`votes/${rid}/${p2.uid}`)), 1));
  await allow('p2 votes option 0', set(P(p2, R(`votes/${rid}/${p2.uid}`)), 0));
  await okT('close voting', host, A.CLOSE_VOTING, {});

  section('S2 scoring, award, reveal, board, undo, reset');
  const ranked = rankOptions([
    { key: p1.uid, n: 0, team: 't1', name: 'An', text: 'a', score: 8, votes: 1, t0: 1 },
    { key: p3.uid, n: 1, team: 't2', name: 'Chi', text: 'b', score: 9, votes: 1, t0: 2 },
    { key: p4.uid, n: 2, team: 't4', name: 'Dũng', text: 'c', score: 7, votes: 2, t0: 3 },
  ], { maxScore: 10, formula: 'host', awardTop: 3, teamAward: 'place' });
  const award = { ...buildAward({ ranked, settings: { maxScore: 10, formula: 'host', awardTop: 3, teamAward: 'place' }, roundId: rid, at: serverTimestamp(), question: q.title }) };
  const board = totals({ [rid]: { ...award, at: 1 } }, {});
  await refT('reveal needs data', host, A.REVEAL, { reveal: { items: [] } }, 'noRevealData');
  await okT('reveal with names, rank and board (transaction)', host, A.REVEAL, { reveal: buildReveal(award), board });
  await allow('award stored once per round (awardUpdates)', update(root(host), ops.awardUpdates({ code, roundId: rid, award, board })));
  await allow('applying the same award again is idempotent', update(root(h2), ops.awardUpdates({ code, roundId: rid, award, board })));
  const stored = (await get(P(host, R('private/awards')))).val();
  check_(Object.keys(stored).length === 1, 'one award record after two writes');
  const rv = (await get(P(p2, R('public/reveal')))).val();
  check_(rv.items.length === 3 && rv.items[0].name && !('text' in rv.items[0]), 'players read the reveal (names unlocked now, no answer text)');
  const sortedJson = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  check_(sortedJson((await get(P(p2, R('public/board')))).val()) === sortedJson(board), 'players read the leaderboard');
  await deny('player cannot write the reveal', set(P(p1, R('public/reveal/top')), 1));
  await deny('player cannot write the board', set(P(p1, R('public/board/t/t1')), 999));
  await deny('board with a non-number is rejected', set(P(host, R('public/board/t/t1')), 'lots'));
  await deny('board for an unknown tổ is rejected', set(P(host, R('public/board/t/t9')), 1));
  await deny('reveal item with a 41-character name is rejected', set(P(host, R('public/reveal/items/0/name')), 'x'.repeat(41)));
  await deny('reveal item with an unknown field is rejected', set(P(host, R('public/reveal/items/0/secret')), 1));
  await okT('leaderboard', host, A.LEADERBOARD, {});
  await refT('undo from the second device while on the leaderboard goes back to scoring', h2, A.LEADERBOARD, {}, 'wrongPhase');
  await okT('undo the award: phase back to scoring and the reveal is cleared', h2, A.UNREVEAL, { board: { t: {}, p: {} } });
  await allow('award removed (removeAwardUpdates)', update(root(h2), ops.removeAwardUpdates({ code, roundId: rid, board: { t: {}, p: {} } })));
  check_(!(await get(P(host, R('private/awards')))).exists() && !(await get(P(host, R('public/reveal')))).exists(), 'no award and no reveal left');
  await okT('reveal again', host, A.REVEAL, { reveal: buildReveal(award), board });
  await allow('award again', update(root(host), ops.awardUpdates({ code, roundId: rid, award, board })));
  await okT('leaderboard again', host, A.LEADERBOARD, {});
  await okT('next question: round state cleared, board kept', host, A.NEXT, {});
  const after = (await get(P(host, R('public')))).val();
  check_(after.phase === 'lobby' && !after.showcase && !after.vote && !after.reveal && !!after.board, 'lobby with a clean round and the board intact');
  await allow('reset points (resetPointsUpdates)', update(root(host), ops.resetPointsUpdates({ code })));
  check_(!(await get(P(host, R('public/board')))).exists() && !(await get(P(host, R('private/awards')))).exists() && !(await get(P(host, R('private/adjust')))).exists(), 'points, awards and the adjustment log are gone');
  await deny('player cannot reset points', update(root(p1), ops.resetPointsUpdates({ code })));

  section('S2 bans and kicks with the new data');
  await allow('host kicks p4 (kickUpdates)', update(root(host), ops.kickUpdates({ code, uid: p4.uid, teamId: 't4', repUid: null })));
  await deny('banned p4 cannot vote any more', set(P(p4, R(`votes/${rid}/${p4.uid}`)), 0));
  await deny('banned p4 cannot write presence', set(P(p4, R(`presence/${p4.uid}`)), true));

  section('S2 cleanup');
  await allow('host ends the room', update(root(host), ops.endRoomUpdates({ code })));
  check_(!(await get(P(host, R('public')))).exists(), 'room is gone');
}
function check_(cond, label) { if (cond) { pass++; console.log(`  ok    ${label}`); } else { fail++; failures.push(label); console.log(`  FAIL  ${label}`); } }

let crashed = false;
try { await main(); await appPayloads(); await stage2(); }
catch (e) { crashed = true; fail++; failures.push('crash: ' + (e?.message || e)); console.error('\nCRASH', e); }
finally {
  // best-effort cleanup if the run died early
  try {
    const h = apps.find((a) => a.name.startsWith('host-'));
    if (h) {
      const db = getDatabase(h);
      await Promise.race([
        update(ref(db), { [R('')]: null, [`secrets/${code}`]: null }).catch(() => {}),
        sleep(8000),
      ]);
    }
  } catch { /* ignore */ }
  for (const a of apps) { try { goOffline(getDatabase(a)); } catch { /* */ } await deleteApp(a).catch(() => {}); }
}
console.log(`\n${pass} passed, ${fail} failed${fail ? '\nFailed: ' + failures.join(' | ') : ''}`);
process.exit(fail ? 1 : 0);
