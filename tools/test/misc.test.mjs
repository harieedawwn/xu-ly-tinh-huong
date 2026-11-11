import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHash, routeUrl, shortUrl } from '../../js/lib/route.js';
import { isZalo, isIOS, isAndroid, isInAppBrowser, canFullscreen } from '../../js/lib/device.js';
import { render } from '../build-rules.mjs';
import * as ops from '../../js/lib/room-ops.js';

test('hash routes', () => {
  assert.deepEqual(parseHash(''), { name: 'home' });
  assert.deepEqual(parseHash('#/'), { name: 'home' });
  assert.deepEqual(parseHash('#/play/k7m2qx'), { name: 'play', code: 'K7M2QX' });
  assert.deepEqual(parseHash('#/tv/K7M2QX'), { name: 'tv', code: 'K7M2QX' });
  assert.deepEqual(parseHash('#/host/K7M2QX'), { name: 'host', code: 'K7M2QX' });
  assert.equal(parseHash('#/play/K7M2Q0').name, 'badcode');
  assert.equal(parseHash('#/play').name, 'badcode');
  assert.equal(parseHash('#/nope').name, 'home');
});

test('urls keep the /xu-ly-tinh-huong/ subpath', () => {
  const loc = { origin: 'https://harieedawwn.github.io', host: 'harieedawwn.github.io', pathname: '/xu-ly-tinh-huong/' };
  assert.equal(routeUrl('play', 'K7M2QX', loc), 'https://harieedawwn.github.io/xu-ly-tinh-huong/#/play/K7M2QX');
  assert.equal(shortUrl('play', 'K7M2QX', { ...loc, pathname: '/xu-ly-tinh-huong/index.html' }), 'harieedawwn.github.io/xu-ly-tinh-huong/#/play/K7M2QX');
});

test('device detection', () => {
  assert.ok(isZalo('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 Zalo/12.3'));
  assert.ok(!isZalo('Mozilla/5.0 (iPhone) Safari'));
  assert.ok(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)'));
  assert.ok(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 5));
  assert.ok(!isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0));
  assert.ok(isAndroid('Android 14'));
  assert.ok(isInAppBrowser('FBAN/FBIOS'));
  assert.ok(canFullscreen({ fullscreenEnabled: true }));
  assert.ok(!canFullscreen({}));
});

test('database.rules.json is generated from tools/build-rules.mjs', () => {
  assert.equal(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'), render());
});

test('rules: no client can read secrets or hostClaims; private is host-only', () => {
  const r = JSON.parse(render()).rules;
  assert.equal(r['.read'], false);
  assert.equal(r.secrets.$code['.read'], undefined);
  assert.equal(r.secrets.$code.pin['.read'], undefined);
  assert.equal(r.rooms.$code.hostClaims.$uid['.read'], undefined);
  assert.match(r.rooms.$code.private['.read'], /hostUids/);
});

test('room-ops: create payload has host, secret pin and public state', () => {
  const u = ops.createRoomUpdates({ code: 'ABC234', uid: 'u1', pin: '012345', ts: 'TS' });
  assert.equal(u['rooms/ABC234/hostUids/u1'], true);
  assert.equal(u['secrets/ABC234/pin'], '012345');
  const pub = u['rooms/ABC234/public'];
  assert.equal(pub.phase, 'lobby');
  assert.equal(Object.keys(pub.settings.teams).length, 4);
  assert.equal(pub.settings.minChars, 20);
  assert.equal(pub.settings.maxChars, 800);
  assert.equal(pub.settings.graceMs, 3000);
});

test('room-ops: round, kick and end payloads', () => {
  const s = ops.startRoundUpdates({ code: 'ABC234', roundNo: 2, question: { id: 'b1', title: 'T', text: 'X', criteria: ['c'] }, durationMs: 60000, nowServer: 1000 });
  assert.equal(s.roundId, 'r3');
  assert.deepEqual(s.updates['rooms/ABC234/public/timer'], { state: 'running', durationMs: 60000, endsAt: 61000 });
  assert.ok(!JSON.stringify(s.updates['rooms/ABC234/public/question']).includes('criteria'));
  const k = ops.kickUpdates({ code: 'ABC234', uid: 'u2', teamId: 't1', repUid: 'u2' });
  assert.equal(k['rooms/ABC234/banned/u2'], true);
  assert.equal(k['rooms/ABC234/players/u2'], null);
  assert.equal(k['rooms/ABC234/reps/t1'], null);
  assert.deepEqual(Object.keys(ops.endRoomUpdates({ code: 'ABC234' })), ['rooms/ABC234', 'secrets/ABC234']);
  assert.deepEqual(ops.claimGuessUpdates({ code: 'ABC234', uid: 'u', pin: '111111', tries: 2 }), { 'rooms/ABC234/hostClaims/u': '111111', 'rooms/ABC234/claimTries/u': 3 });
});
