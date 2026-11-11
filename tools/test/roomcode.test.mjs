import test from 'node:test';
import assert from 'node:assert/strict';
import { CODE_ALPHABET, generateCode, generatePin, normalizeCode, isValidCode, isValidPin, normalizePin } from '../../js/lib/roomcode.js';

test('alphabet has no ambiguous characters', () => {
  for (const bad of '01OIL') assert.ok(!CODE_ALPHABET.includes(bad), bad);
  assert.equal(new Set(CODE_ALPHABET).size, CODE_ALPHABET.length);
});

test('generateCode: 6 valid characters, many distinct values', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const c = generateCode();
    assert.equal(c.length, 6);
    assert.ok(isValidCode(c), c);
    seen.add(c);
  }
  assert.ok(seen.size > 495);
});

test('generateCode is deterministic with an injected rng and covers the whole alphabet', () => {
  let i = 0;
  const c = generateCode((max) => i++ % max);
  assert.equal(c, CODE_ALPHABET.slice(0, 6));
  const all = new Set();
  for (let k = 0; k < CODE_ALPHABET.length; k++) all.add(CODE_ALPHABET[k]);
  assert.equal(all.size, 31);
});

test('normalizeCode / isValidCode', () => {
  assert.equal(normalizeCode(' ab-c d.e_f '), 'ABCDEF');
  assert.ok(isValidCode('ABCDEF'));
  assert.ok(!isValidCode('ABCDE'));
  assert.ok(!isValidCode('ABCDE0'));
  assert.ok(!isValidCode('abcdef'));
  assert.ok(!isValidCode(null));
});

test('PIN: 6 digits, leading zeros kept as string', () => {
  for (let i = 0; i < 200; i++) assert.ok(isValidPin(generatePin()));
  assert.equal(generatePin(() => 0), '000000');
  assert.ok(isValidPin('012345'));
  assert.ok(!isValidPin(12345));
  assert.ok(!isValidPin('12345'));
  assert.ok(!isValidPin('12345a'));
  assert.equal(normalizePin('12 34-56789'), '123456');
});
