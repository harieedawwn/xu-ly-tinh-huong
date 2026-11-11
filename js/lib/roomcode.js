// Room code and host PIN helpers. Pure, no DOM, no Firebase.

// 31 characters: no 0/O, 1/I/L (ambiguous when read from a projector).
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const PIN_LENGTH = 6;

function defaultRandomInt(max) {
  // Rejection sampling over one byte: no modulo bias for max <= 256.
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

/** @param {(max:number)=>number} [randInt] injectable for tests */
export function generateCode(randInt = defaultRandomInt) {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randInt(CODE_ALPHABET.length)];
  return s;
}

export function generatePin(randInt = defaultRandomInt) {
  let s = '';
  for (let i = 0; i < PIN_LENGTH; i++) s += String(randInt(10));
  return s;
}

/** Uppercase, drop spaces/dashes/dots typed while reading a code aloud. */
export function normalizeCode(input) {
  return String(input ?? '').toUpperCase().replace(/[\s\-._]/g, '');
}

export function isValidCode(code) {
  if (typeof code !== 'string' || code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function isValidPin(pin) {
  return typeof pin === 'string' && /^[0-9]{6}$/.test(pin);
}

/** Digits only, capped at PIN_LENGTH; used while typing. */
export function normalizePin(input) {
  return String(input ?? '').replace(/\D/g, '').slice(0, PIN_LENGTH);
}
