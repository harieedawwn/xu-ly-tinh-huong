// Download a text file, or fall back to copying when the browser blocks downloads (Zalo in-app webview).
import { copyText } from '../ui.js';

export const isZalo = (ua = navigator.userAgent) => /Zalo/i.test(ua);

/** @returns {Promise<'download'|'copied'|'failed'>} */
export async function saveText(filename, text, mime = 'text/plain;charset=utf-8') {
  if (!isZalo()) {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      if ('download' in a) return 'download';
    } catch { /* fall through to copy */ }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}
