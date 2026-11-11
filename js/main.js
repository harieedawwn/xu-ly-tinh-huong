import { render } from '../vendor/preact.mjs';
import { useState, useEffect, useCallback } from '../vendor/preact-hooks.mjs';
import { html, Btn, Icon, ErrorPanel, Spinner, ToastHost, DialogHost } from './ui.js';
import * as fb from './fb.js';
import { parseHash } from './lib/route.js';
import { installViewport } from './lib/viewport.js';
import { useHashRoute } from './hooks.js';
import { Home } from './screens/home.js';
import { PlayerScreen } from './screens/player.js';
import { TvScreen } from './screens/tv.js';
import { HostScreen } from './screens/host.js';

installViewport();

function useSession() {
  const [s, setS] = useState({ status: 'loading' });
  const start = useCallback(async () => {
    setS({ status: 'loading' });
    try { const uid = await fb.ensureUser(); setS({ status: 'ready', uid }); }
    catch (e) { setS({ status: 'error', error: fb.describeError(e) }); }
  }, []);
  useEffect(() => { start(); }, []);
  return [s, start];
}

function App() {
  const route = useHashRoute(parseHash);
  const [session, retry] = useSession();

  if (session.status === 'loading') return html`<div class="center stack"><${Spinner} /><p class="strong">Đang kết nối…</p></div>`;
  if (session.status === 'error') {
    return html`<main class="home scroll"><div class="card stack">
      <h2>Chưa vào được</h2>
      <${ErrorPanel} text=${session.error.text} onRetry=${retry} />
    </div></main>`;
  }
  const { uid } = session;
  switch (route.name) {
    case 'play': return html`<${PlayerScreen} key=${route.code} code=${route.code} uid=${uid} />`;
    case 'tv': return html`<${TvScreen} key=${route.code} code=${route.code} />`;
    case 'host': return html`<${HostScreen} key=${route.code} code=${route.code} uid=${uid} />`;
    case 'badcode': return html`<main class="home scroll"><div class="card stack"><h2>Mã phòng chưa đúng</h2><p>Mã phòng gồm 6 ký tự, ví dụ K7M2QX.</p><a class="btn btn--primary" href="#/">Về trang chủ</a></div></main>`;
    default: return html`<${Home} uid=${uid} />`;
  }
}

render(html`<${App} /><${ToastHost} /><${DialogHost} />`, document.getElementById('app'));
