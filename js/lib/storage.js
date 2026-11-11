// localStorage that never throws (private windows, blocked storage, Zalo quirks).
const mem = new Map();
export const store = {
  get(key, fallback = null) {
    try { const v = globalThis.localStorage?.getItem(key); return v === null || v === undefined ? (mem.get(key) ?? fallback) : v; }
    catch { return mem.get(key) ?? fallback; }
  },
  set(key, value) {
    mem.set(key, String(value));
    try { globalThis.localStorage?.setItem(key, String(value)); return true; } catch { return false; }
  },
  remove(key) {
    mem.delete(key);
    try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
  },
  getJSON(key, fallback = null) {
    const v = this.get(key);
    if (v == null) return fallback;
    try { return JSON.parse(v); } catch { return fallback; }
  },
  setJSON(key, value) { return this.set(key, JSON.stringify(value)); },
};
export const K = {
  draft: (code, round) => `xlth.draft.${code}.${round}`,
  hostRooms: 'xlth.hostRooms',
  pin: (code) => `xlth.pin.${code}`,
  tvTheme: 'xlth.tv.theme',
  tvSize: 'xlth.tv.size',
  playerSize: 'xlth.player.size',
  recentCode: 'xlth.recentCode',
};
