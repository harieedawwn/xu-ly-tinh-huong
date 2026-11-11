// Public web config (safe to ship: access is enforced by database.rules.json, not by hiding this).
export const firebaseConfig = {
  apiKey: 'AIzaSyBHiFGRMy0UjeP6cPOSzIToOPWzqUygUBQ',
  authDomain: 'xu-ly-tinh-huong.firebaseapp.com',
  databaseURL: 'https://xu-ly-tinh-huong-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'xu-ly-tinh-huong',
  storageBucket: 'xu-ly-tinh-huong.firebasestorage.app',
  messagingSenderId: '454364417434',
  appId: '1:454364417434:web:c3711eeaef60437f4e7e23',
};

// Pinned Firebase JS SDK (official gstatic CDN, modular). Recorded in SPEC.md.
export const FIREBASE_SDK_VERSION = '13.2.0';
export const FIREBASE_CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
