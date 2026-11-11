import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../js/lib/timer.js';

test('start and remaining', () => {
  const t = T.startTimer(90_000, 1_000_000);
  assert.deepEqual(t, { state: 'running', durationMs: 90_000, endsAt: 1_090_000 });
  assert.equal(T.remainingMs(t, 1_000_000), 90_000);
  assert.equal(T.remainingMs(t, 1_045_000), 45_000);
  assert.equal(T.remainingMs(t, 1_200_000), 0);
});

test('clients with different offsets agree on remaining time (server time)', () => {
  const serverTrue = 5_000_000;
  const t = T.startTimer(60_000, serverTrue);
  // phone clock is 3 s fast, TV clock 2 s slow; each knows its own offset to server time
  const phoneLocal = serverTrue + 3000, phoneOffset = -3000;
  const tvLocal = serverTrue - 2000, tvOffset = 2000;
  const later = 10_000;
  const a = T.remainingMs(t, T.serverNow(phoneOffset, () => phoneLocal + later));
  const b = T.remainingMs(t, T.serverNow(tvOffset, () => tvLocal + later));
  assert.equal(a, 50_000);
  assert.ok(Math.abs(a - b) <= 200);
});

test('pause stores remainingMs, resume restores endsAt', () => {
  const t = T.startTimer(120_000, 0);
  const p = T.pauseTimer(t, 30_000);
  assert.deepEqual(p, { state: 'paused', durationMs: 120_000, remainingMs: 90_000 });
  assert.equal(T.remainingMs(p, 999_999), 90_000);
  const r = T.resumeTimer(p, 500_000);
  assert.deepEqual(r, { state: 'running', durationMs: 120_000, endsAt: 590_000 });
  assert.equal(T.pauseTimer(p, 1), p);
  assert.equal(T.resumeTimer(t, 1), t);
});

test('extend running, paused, and expired timers', () => {
  const t = T.startTimer(60_000, 0);
  assert.equal(T.extendTimer(t, 30_000, 10_000).endsAt, 90_000);
  assert.equal(T.extendTimer(t, 30_000, 10_000).durationMs, 90_000);
  const p = T.pauseTimer(t, 20_000);
  assert.equal(T.extendTimer(p, 30_000, 20_000).remainingMs, 70_000);
  // already expired: extension counts from now, not from the past
  assert.equal(T.extendTimer(t, 30_000, 100_000).endsAt, 130_000);
  const idle = T.idleTimer(60_000);
  assert.equal(T.extendTimer(idle, 30_000, 0), idle);
});

test('display rounding and clock format', () => {
  assert.equal(T.displaySeconds(0), 0);
  assert.equal(T.displaySeconds(1), 1);
  assert.equal(T.displaySeconds(59_001), 60);
  assert.equal(T.formatClock(90_000), '01:30');
  assert.equal(T.formatClock(9_100), '00:10');
  assert.equal(T.formatClock(-5), '00:00');
  assert.equal(T.formatClock(3_599_000), '59:59');
});

test('submit window mirrors the database rule (grace included, paused open)', () => {
  const t = T.startTimer(10_000, 0);
  assert.ok(T.isSubmitWindowOpen(t, 3000, 12_999));
  assert.ok(T.isSubmitWindowOpen(t, 3000, 13_000));
  assert.ok(!T.isSubmitWindowOpen(t, 3000, 13_001));
  assert.ok(T.isSubmitWindowOpen(T.pauseTimer(t, 5_000), 3000, 999_999));
  assert.ok(!T.isSubmitWindowOpen(T.idleTimer(1), 3000, 0));
  assert.ok(!T.isSubmitWindowOpen(null, 3000, 0));
  assert.ok(T.isExpired(t, 10_000));
  assert.ok(!T.isExpired(t, 9_999));
});

test('parseDuration', () => {
  assert.equal(T.parseDuration('90'), 90_000);
  assert.equal(T.parseDuration('1:30'), 90_000);
  assert.equal(T.parseDuration(' 150 '), 150_000);
  assert.equal(T.parseDuration('5'), null);
  assert.equal(T.parseDuration('1:75'), null);
  assert.equal(T.parseDuration('abc'), null);
  assert.equal(T.parseDuration('9999'), null);
});
