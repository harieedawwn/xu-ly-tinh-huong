// Device / webview detection. Pure (user agent in, boolean out) so it can be unit tested.
export const isZalo = (ua = '') => /\bZalo\b|Zalo\//i.test(ua);
export const isFacebookApp = (ua = '') => /FBAN|FBAV|FB_IAB/i.test(ua);
export const isIOS = (ua = '', maxTouchPoints = 0) => /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
export const isAndroid = (ua = '') => /Android/i.test(ua);
export const isInAppBrowser = (ua = '') => isZalo(ua) || isFacebookApp(ua) || /Instagram|Line\//i.test(ua);

/** Fullscreen works on Android/desktop Chrome; iPhone Safari only supports it for video. */
export const canFullscreen = (doc) => !!(doc && (doc.fullscreenEnabled || doc.webkitFullscreenEnabled));
