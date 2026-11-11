import test from 'node:test';
import assert from 'node:assert/strict';
import { validateName, uniqueName, validateAnswer, cleanName, looksLikeSpam, NAME_MAX } from '../../js/lib/validate.js';

test('name: trims, collapses spaces, strips invisible characters', () => {
  assert.equal(cleanName('  Lan   Anh​ '), 'Lan Anh');
  assert.deepEqual(validateName('  Minh   Khôi '), { ok: true, value: 'Minh Khôi' });
});

test('name: length limits 2..24', () => {
  assert.equal(validateName('').error, 'empty');
  assert.equal(validateName('   ').error, 'empty');
  assert.equal(validateName('A').error, 'short');
  assert.ok(validateName('An').ok);
  assert.ok(validateName('a'.repeat(NAME_MAX)).ok);
  assert.equal(validateName('a'.repeat(NAME_MAX + 1)).error, 'long');
});

test('name: profanity rejected, host words honoured', () => {
  assert.equal(validateName('đồ chó đẻ').error, 'profane');
  assert.ok(validateName('Bình An').ok);
  assert.equal(validateName('Tèo Bí Ngô', { extra: ['bi ngo'] }).error, 'profane');
});

test('uniqueName appends (2), (3) and respects the limit', () => {
  assert.equal(uniqueName('An', []), 'An');
  assert.equal(uniqueName('An', ['An']), 'An (2)');
  assert.equal(uniqueName('An', ['An', 'An (2)']), 'An (3)');
  assert.equal(uniqueName('an', ['An']), 'an (2)');
  const long = 'x'.repeat(NAME_MAX);
  const u = uniqueName(long, [long]);
  assert.ok(u.length <= NAME_MAX);
  assert.ok(u.endsWith(' (2)'));
});

test('answer: empty / whitespace-only / limits', () => {
  assert.equal(validateAnswer('').error, 'empty');
  assert.equal(validateAnswer('  \n\t  ').error, 'empty');
  assert.equal(validateAnswer('ngắn quá').error, 'short');
  assert.ok(validateAnswer('Mình sẽ nói chuyện với bố mẹ trước khi đăng ký môn học.').ok);
  assert.equal(validateAnswer('x '.repeat(500)).error, 'long');
  assert.equal(validateAnswer('abcdefghij', { min: 5, max: 9 }).error, 'long');
  assert.ok(validateAnswer('abcdefghij', { min: 5, max: 10 }).ok);
});

test('answer: normalises line endings and trims', () => {
  const r = validateAnswer('\r\n  Dòng một của câu trả lời.\r\nDòng hai của câu trả lời.  \r\n', {});
  assert.ok(r.ok);
  assert.equal(r.value, 'Dòng một của câu trả lời.\nDòng hai của câu trả lời.');
});

test('answer: repeated-character spam is blocked, real text is not', () => {
  for (const s of ['a'.repeat(40), 'hahahahahahahahahahahaha', 'asd asd asd asd asd asd asd asd', 'ok ok ok ok ok ok ok ok ok ok', '.......................']) {
    assert.ok(looksLikeSpam(s), s);
    assert.equal(validateAnswer(s).error, 'spam', s);
  }
  const real = 'Mình sẽ gặp bố mẹ, đưa ra bản thiết kế đã làm và hỏi họ lo lắng điều gì nhất, rồi cùng tìm một lựa chọn chung.';
  assert.ok(!looksLikeSpam(real));
  assert.ok(validateAnswer(real).ok);
});
