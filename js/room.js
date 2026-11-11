// Room operations that talk to Firebase. Payloads come from lib/room-ops.js (also used by the rules test).
import * as fb from './fb.js';
import { generateCode } from './lib/roomcode.js';
import { createRoomUpdates, claimGuessUpdates, rp, MAX_CLAIM_TRIES } from './lib/room-ops.js';
import { store, K } from './lib/storage.js';

const isDenied = (e) => /permission[_ ]denied/i.test(`${e?.code} ${e?.message}`);

export async function roomExists(code) {
  return (await fb.get(rp(code, 'public/phase'))) != null;
}

/** Create a room with a fresh code. Retries on the (very unlikely) code collision. */
export async function createRoom(uid, pin) {
  for (let i = 0; i < 6; i++) {
    const code = generateCode();
    if (await roomExists(code)) continue;
    try {
      await fb.update(createRoomUpdates({ code, uid, pin, ts: fb.serverTs() }));
      rememberHostRoom(code, pin);
      return code;
    } catch (e) {
      if (isDenied(e)) continue; // somebody created the same code a moment ago
      throw e;
    }
  }
  throw new Error('Không tạo được mã phòng. Thử lại.');
}

/**
 * Become host on this device. The PIN is only ever compared by the database rules:
 * guess -> hostClaims/{uid} (+ claimTries), then hostUids/{uid} is accepted only if the claim equals the secret.
 * @returns {{ok:true}|{ok:false, reason:'noroom'|'wrong'|'exhausted', left?:number}}
 */
export async function claimHost(uid, code, pin) {
  if (!(await roomExists(code))) return { ok: false, reason: 'noroom' };
  if ((await fb.get(rp(code, `hostUids/${uid}`))) === true) return { ok: true };
  const tries = Number(await fb.get(rp(code, `claimTries/${uid}`))) || 0;
  if (tries >= MAX_CLAIM_TRIES) return { ok: false, reason: 'exhausted', left: 0 };
  try {
    await fb.update(claimGuessUpdates({ code, uid, pin, tries }));
  } catch (e) {
    if (isDenied(e)) return { ok: false, reason: 'exhausted', left: 0 };
    throw e;
  }
  try {
    await fb.set(rp(code, `hostUids/${uid}`), true);
  } catch (e) {
    if (isDenied(e)) return { ok: false, reason: 'wrong', left: Math.max(0, MAX_CLAIM_TRIES - tries - 1) };
    throw e;
  }
  rememberHostRoom(code);
  return { ok: true };
}

/** Recent rooms hosted from this device (for the home screen). */
export function rememberHostRoom(code, pin) {
  const list = store.getJSON(K.hostRooms, []).filter((x) => x.code !== code);
  list.unshift({ code, at: Date.now() });
  store.setJSON(K.hostRooms, list.slice(0, 5));
  if (pin) store.set(K.pin(code), pin);
}
export const recentHostRooms = () => store.getJSON(K.hostRooms, []);
export const forgetHostRoom = (code) => {
  store.setJSON(K.hostRooms, store.getJSON(K.hostRooms, []).filter((x) => x.code !== code));
  store.remove(K.pin(code));
};
