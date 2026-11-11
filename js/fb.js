// Firebase wiring (modular SDK from the official gstatic CDN, pinned in firebase-config.js).
// Auth: one persisted anonymous account per browser. We NEVER create a second one when a user is already
// persisted (a whole class shares one school IP; the Auth limit is 100 new accounts / hour / IP).
import { firebaseConfig, FIREBASE_CDN } from './firebase-config.js';

let sdk = null;          // { app, auth, db, m: { ...database fns }, a: { ...auth fns } }
let loading = null;
let offsetMs = 0;
const offsetListeners = new Set();

const isLocalHost = () => ['localhost', '127.0.0.1'].includes(location.hostname);
export const useEmulator = () => isLocalHost() && new URLSearchParams(location.search).has('emu');

export function loadFirebase() {
  if (sdk) return Promise.resolve(sdk);
  if (loading) return loading;
  loading = (async () => {
    const [appM, authM, dbM] = await Promise.all([
      import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-app.js`),
      import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-auth.js`),
      import(/* @vite-ignore */ `${FIREBASE_CDN}/firebase-database.js`),
    ]);
    const app = appM.initializeApp(firebaseConfig);
    const auth = authM.getAuth(app);
    const db = dbM.getDatabase(app);
    if (useEmulator()) {
      authM.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      dbM.connectDatabaseEmulator(db, '127.0.0.1', 9000);
    }
    sdk = { app, auth, db, m: dbM, a: authM };
    dbM.onValue(dbM.ref(db, '.info/serverTimeOffset'), (s) => {
      offsetMs = Number(s.val()) || 0;
      offsetListeners.forEach((f) => f(offsetMs));
    });
    return sdk;
  })().catch((e) => { loading = null; throw e; });
  return loading;
}

/** Wait for the persisted user (if any); sign in anonymously only when there is none. */
export async function ensureUser() {
  const { auth, a } = await loadFirebase();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await a.signInAnonymously(auth);
  return cred.user.uid;
}

export const currentUid = () => sdk?.auth.currentUser?.uid ?? null;
export const serverNow = () => Date.now() + offsetMs;
export const serverOffset = () => offsetMs;
export const onOffset = (f) => { offsetListeners.add(f); return () => offsetListeners.delete(f); };
export const serverTs = () => sdk.m.serverTimestamp();

const r = (path) => (path ? sdk.m.ref(sdk.db, path) : sdk.m.ref(sdk.db));

export function listen(path, onValue, onError) {
  return sdk.m.onValue(r(path), (s) => onValue(s.val()), (e) => onError?.(e));
}
export const get = async (path) => (await sdk.m.get(r(path))).val();
export const set = (path, value) => sdk.m.set(r(path), value);
export const update = (updates, base = '') => sdk.m.update(r(base), updates);
export const remove = (path) => sdk.m.remove(r(path));

/** Presence: set while connected, cleared by the server on disconnect (re-armed on every reconnect). */
export function holdPresence(path) {
  const { m } = sdk;
  const conn = m.ref(sdk.db, '.info/connected');
  const pr = r(path);
  return m.onValue(conn, (s) => {
    if (s.val() === true) {
      m.onDisconnect(pr).remove().then(() => m.set(pr, m.serverTimestamp())).catch(() => {});
    }
  });
}
export function onConnected(cb) {
  return sdk.m.onValue(sdk.m.ref(sdk.db, '.info/connected'), (s) => cb(s.val() === true));
}
export const goOnline = () => sdk?.m.goOnline(sdk.db);
export const goOffline = () => sdk?.m.goOffline(sdk.db);

/** Turn any Firebase / network error into short Vietnamese copy plus a hint for the UI. */
export function describeError(e) {
  const code = String(e?.code || '');
  const msg = String(e?.message || e || '');
  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded')
    return { text: 'Mạng trường đã tạo quá nhiều tài khoản trong một giờ. Chờ vài phút rồi bấm Thử lại.', kind: 'quota' };
  if (code === 'auth/network-request-failed' || /network|fetch|Failed to fetch|offline/i.test(msg))
    return { text: 'Không kết nối được. Kiểm tra WiFi hoặc 4G rồi bấm Thử lại.', kind: 'network' };
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation')
    return { text: 'Hệ thống chưa bật đăng nhập ẩn danh. Báo Host để kiểm tra Firebase.', kind: 'config' };
  if (/permission[_ ]denied/i.test(code + msg))
    return { text: 'Không có quyền thực hiện thao tác này.', kind: 'denied' };
  if (/quota|exceeded|too many/i.test(msg))
    return { text: 'Hệ thống đang quá tải hoặc đã hết lượt miễn phí trong ngày. Chờ một lát rồi thử lại.', kind: 'quota' };
  if (/import|module|load/i.test(msg) && !code)
    return { text: 'Không tải được thư viện Firebase. Kiểm tra mạng rồi bấm Thử lại.', kind: 'network' };
  return { text: 'Có lỗi xảy ra. Bấm Thử lại.', kind: 'unknown' };
}
