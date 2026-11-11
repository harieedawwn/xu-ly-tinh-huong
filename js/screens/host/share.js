import { useState } from '../../../vendor/preact-hooks.mjs';
import { html, Btn, Icon, QR, Tab, toast, copyText } from '../../ui.js';
import { routeUrl, routeHash } from '../../lib/route.js';
import { store, K } from '../../lib/storage.js';

export function Share({ code, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const [showPin, setShowPin] = useState(false);
  const url = routeUrl('play', code);
  const pin = store.get(K.pin(code));
  const copy = async (text, msg) => { toast((await copyText(text)) ? msg : 'Không sao chép được. Hãy chọn và sao chép thủ công.'); };
  return html`<section class="card stack">
    <div class="row spread"><h3>Mời lớp vào phòng</h3><${Btn} small class="btn--icon" aria-label=${open ? 'Thu gọn' : 'Mở rộng'} icon=${open ? 'down' : 'qr'} onClick=${() => setOpen(!open)} /></div>
    <div class="row"><${Tab} text=${code} class="wide share__code" /></div>
    <div class="row">
      <${Btn} small icon="copy" onClick=${() => copy(url, 'Đã sao chép liên kết')}>Sao chép liên kết<//>
      <a class="btn btn--small" href=${routeHash('tv', code)} target="_blank" rel="noopener"><${Icon} name="tv" />Mở màn hình TV</a>
    </div>
    ${open ? html`<div class="row" style="align-items:flex-start"><${QR} text=${url} style="width:168px" />
      <div class="stack-s grow"><span class="help">${url.replace(/^https?:\/\//, '')}</span>
        <div class="row row--nowrap"><span class="label">PIN</span>${pin ? html`<span class="strong"><${Tab} text=${showPin ? pin : '••••••'} /></span><${Btn} small class="btn--icon" aria-label=${showPin ? 'Ẩn PIN' : 'Hiện PIN'} icon=${showPin ? 'eye-off' : 'eye'} onClick=${() => setShowPin(!showPin)} />` : html`<span class="help">Không lưu trên thiết bị này</span>`}</div>
      </div></div>` : null}
  </section>`;
}

/* ---------------- board ---------------- */
const sameBoard = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
}
const normBoard = (b) => ({ t: b?.t || {}, p: b?.p || {} });

