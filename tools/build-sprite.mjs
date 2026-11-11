// Dev tool: builds the inline SVG sprite (Lucide subset, ISC) into index.html.
// Usage: node tools/build-sprite.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(root, 'tools/node_modules/lucide-static/icons');

// id used in the app -> lucide file name
export const ICONS = {
  wifi: 'wifi', 'wifi-off': 'wifi-off', copy: 'copy', check: 'check', x: 'x', plus: 'plus', minus: 'minus',
  play: 'play', pause: 'pause', lock: 'lock', unlock: 'lock-open', users: 'users', user: 'user', clock: 'clock',
  qr: 'qr-code', tv: 'tv', maximize: 'maximize', minimize: 'minimize', settings: 'settings', trash: 'trash-2',
  edit: 'pencil', left: 'chevron-left', right: 'chevron-right', down: 'chevron-down', home: 'house', send: 'send',
  eye: 'eye', 'eye-off': 'eye-off', refresh: 'refresh-cw', info: 'info', moon: 'moon', sun: 'sun',
  text: 'a-large-small', 'arrow-left': 'arrow-left', 'arrow-right': 'arrow-right', download: 'download',
  shield: 'shield', trophy: 'trophy', exit: 'log-out', alert: 'triangle-alert', 'check-circle': 'circle-check',
  key: 'key-round', share: 'share-2', external: 'external-link', door: 'door-open', ban: 'ban',
  'user-x': 'user-x', hourglass: 'hourglass', undo: 'rotate-ccw', timer: 'timer', megaphone: 'megaphone',
};

function inner(svg) {
  return svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
}

export function buildSprite() {
  const symbols = Object.entries(ICONS)
    .map(([id, file]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${inner(readFileSync(join(iconDir, file + '.svg'), 'utf8'))}</symbol>`)
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">\n${symbols}\n</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = join(root, 'index.html');
  const html = readFileSync(p, 'utf8');
  const re = /<!-- sprite:start -->[\s\S]*<!-- sprite:end -->/;
  if (!re.test(html)) throw new Error('sprite markers missing in index.html');
  writeFileSync(p, html.replace(re, () => `<!-- sprite:start -->\n${buildSprite()}\n<!-- sprite:end -->`));
  console.log('sprite updated:', Object.keys(ICONS).length, 'icons');
}
