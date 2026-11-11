// Security-rules test. Runs against the REAL database by default, or the local emulator with --emulator.
//   node tools/rules-test.mjs                       (real project; needs rules deployed; makes ~12 anonymous accounts)
//   node tools/with-emulator.mjs node tools/rules-test.mjs --emulator
// Creates a throwaway room (random code), checks allowed and forbidden actions, then deletes the room.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, ref, get, set, update, remove, onValue, serverTimestamp, connectDatabaseEmulator, goOffline } from 'firebase/database';
import { firebaseConfig } from '../js/firebase-config.js';
import { generateCode } from '../js/lib/roomcode.js';
import { defaultTeams } from '../js/lib/teams.js';
import * as ops from '../js/lib/room-ops.js';
import { startTimer } from '../js/lib/timer.js';

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

let crashed = false;
try { await main(); await appPayloads(); }
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
