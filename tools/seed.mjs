// Seeds a room on the emulator with fake players and answers written by a host client (no browsers needed).
// Used by perf-s2.mjs and the AI round-trip UI check. The fake players have no accounts: the host may write any uid.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, ref, update, runTransaction, serverTimestamp, connectDatabaseEmulator, goOffline } from 'firebase/database';
import { firebaseConfig } from '../js/firebase-config.js';
import { generateCode } from '../js/lib/roomcode.js';
import * as ops from '../js/lib/room-ops.js';
import { A } from '../js/lib/phases.js';
import { runTransition } from '../js/lib/tx.js';
import { SCENARIOS } from '../js/data/scenarios.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khánh', 'Lan', 'Minh', 'Nam', 'Oanh', 'Phúc', 'Quân', 'Trang', 'Uyên', 'Vy', 'Yến', 'Hùng', 'Thảo', 'Long'];
const TOPICS = ['nói chuyện với bố mẹ', 'hỏi cô chủ nhiệm', 'làm bảng so sánh', 'thử một dự án nhỏ', 'nhờ anh chị tư vấn', 'đi tham quan ngày hội hướng nghiệp', 'lập kế hoạch một tuần', 'viết ra ưu nhược điểm', 'tìm người đã đi trước', 'xin thêm thời gian suy nghĩ'];
const TAILS = ['rồi mới quyết định', 'để cả nhà yên tâm', 'và chuẩn bị phương án dự phòng', 'vì mình không muốn hối hận', 'trước khi hết hạn đăng ký', 'cùng một người bạn thân'];

/** n deterministic answers of 120-380 characters, a few of them near-duplicates of each other. */
export function fakeAnswers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = TOPICS[i % TOPICS.length];
    const b = TOPICS[(i * 3 + 1) % TOPICS.length];
    const t = TAILS[(i * 5) % TAILS.length];
    let text = `Mình sẽ ${a}, sau đó ${b} ${t}. Quan trọng là mình nói thật về điều mình thích và nghe kỹ nỗi lo của bố mẹ, rồi cùng tìm cách vừa an toàn vừa không bỏ đam mê (cách số ${i + 1}).`;
    if (i % 9 === 4) text = out[i - 1].text + ' Mình đồng ý.'; // near-duplicate of the previous answer
    out.push({ name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : ''}`, team: `t${(i % 4) + 1}`, text });
  }
  return out;
}

/**
 * @param {{answers: {name:string,team:string,text:string}[], upTo?: 'reviewing'|'locked'|'lobby', questionId?: string}} o
 * @returns {Promise<{code:string,pin:string,uids:string[],close:()=>Promise<void>}>}
 */
export async function seedRoom({ answers, upTo = 'reviewing', questionId = 'b1' }) {
  const code = generateCode();
  const pin = '135790';
  const app = initializeApp(firebaseConfig, `seed-${code}`);
  const auth = getAuth(app);
  const db = getDatabase(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  const cred = await signInAnonymously(auth);
  const R = (p) => `rooms/${code}/${p}`;
  await update(ref(db), ops.createRoomUpdates({ code, uid: cred.user.uid, pin, ts: serverTimestamp() }));
  const uids = answers.map((_, i) => `fake${String(i + 1).padStart(3, '0')}`);
  const players = {};
  uids.forEach((u, i) => { players[R(`players/${u}`)] = { name: answers[i].name, team: answers[i].team, joinedAt: serverTimestamp() }; });
  await update(ref(db), players);
  if (upTo === 'lobby') return { code, pin, uids, close };
  const q = SCENARIOS.find((s) => s.id === questionId);
  await update(ref(db), { [R('private/criteria')]: q.criteria });
  const tx = { runTransaction, ref: ref(db, R('public')) };
  const serverNow = Date.now();
  let r = await runTransition(tx, A.START, { question: { id: q.id, title: q.title, text: q.text }, durationMs: 600_000, now: serverNow });
  if (!r.ok) throw new Error(`seed start: ${r.error}`);
  // sequential writes so first-submit times (t0) increase with the uid order
  for (let i = 0; i < uids.length; i++) {
    await update(ref(db), ops.submitUpdates({ code, roundId: 'r1', uid: uids[i], text: answers[i].text, ts: serverTimestamp() }));
    if (i % 8 === 7) await sleep(5);
  }
  r = await runTransition(tx, A.LOCK, {});
  if (!r.ok) throw new Error(`seed lock: ${r.error}`);
  if (upTo === 'reviewing') {
    r = await runTransition(tx, A.REVIEW, {});
    if (!r.ok) throw new Error(`seed review: ${r.error}`);
  }
  return { code, pin, uids, close };

  async function close() { try { goOffline(db); } catch { /* */ } await deleteApp(app).catch(() => {}); }
}
