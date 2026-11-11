// Hash router. GitHub Pages has no SPA fallback, so routes live after '#'.
import { normalizeCode, isValidCode } from './roomcode.js';

/** '#/play/ABC234' -> { name:'play', code:'ABC234' } */
export function parseHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  const [kind, rawCode] = parts;
  if (['play', 'tv', 'host'].includes(kind)) {
    const code = normalizeCode(rawCode);
    return isValidCode(code) ? { name: kind, code } : { name: 'badcode', kind, raw: rawCode ?? '' };
  }
  return { name: 'home' };
}

export const routeHash = (kind, code) => `#/${kind}/${code}`;

/** Absolute URL of a route on the current page (works on /xu-ly-tinh-huong/ subpath and on localhost). */
export function routeUrl(kind, code, loc = globalThis.location) {
  const base = `${loc.origin}${loc.pathname}`;
  return `${base}${routeHash(kind, code)}`;
}

/** Short, speakable form for the TV: host + path without the scheme and without index.html. */
export function shortUrl(kind, code, loc = globalThis.location) {
  const path = loc.pathname.replace(/index\.html$/, '');
  return `${loc.host}${path}${routeHash(kind, code)}`.replace(/^www\./, '');
}
