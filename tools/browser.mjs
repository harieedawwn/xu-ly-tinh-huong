// Shared Playwright launcher (dev only). Uses the pre-installed Chromium and the sandbox proxy when present.
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  const p = dir && join(base, dir, 'chrome-linux64', 'chrome');
  return p && existsSync(p) ? p : undefined;
}

export function launch() {
  const proxy = process.env.HTTPS_PROXY_ORIG || process.env.HTTPS_PROXY || process.env.https_proxy;
  return chromium.launch({
    executablePath: chromePath(),
    args: ['--no-sandbox'],
    ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {}),
  });
}
