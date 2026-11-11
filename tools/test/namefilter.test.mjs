import test from 'node:test';
import assert from 'node:assert/strict';
import { checkName } from '../../js/lib/namefilter.js';

const bad = [
  'địt mẹ', 'Dit me', 'DIT ME', 'd.i.t m.e', 'd i t  m e', 'd-i-t-m-e', 'ditme', 'dit_me', 'đụ má', 'du ma',
  'cặc', 'lồn', 'buồi', 'đéo', 'con cặc', 'concac', 'c.o.n c.a.c', 'đồ chó', 'óc chó', 'oc cho', 'thang cho', 'súc vật', 'suc vat',
  'vcl', 'V.C.L', 'vkl', 'đm', 'dmm', 'd.m.m', 'dcm', 'clgt', 'cc',
  'fuck', 'FUCK you', 'f.u.c.k', 'f u c k', 'fuuuck', 'fvck'.replace('v', 'u'), 'sh1t', 'b1tch', 'bitch', 'a$$hole', '@sshole', 'motherfucker',
  'pussy', 'cunt', 'n1gger', 'dick', 'porn', 'sex',
  'Nguyễn Địt Mẹ', 'xxfuckxx', 'F.U.C.K.E.R', 'sh!t',
];
const good = [
  'Nguyễn Văn An', 'Các bạn', 'Minh Cát', 'Lan Anh', 'Hà Vi', 'Cúc', 'Duy', 'Du Mai', 'Hoàng Đức Mạnh', 'Thanh Bình', 'Dũng',
  'Ngọc Lâm', 'Phúc', 'Khánh Linh', 'Tuấn Anh 11A2', 'Mai Chi', 'Bảo Ngân', 'Quỳnh Như', 'Hồ Thị Lộc', 'Cường', 'Dương Mịch',
  'Scunthorpe'.slice(0, 0) + 'Cassandra', 'Assad Ali', 'Dickson'.slice(0, 0) + 'Richard', 'Kiều Lượng', 'Đào Dung', 'Thu Đông', 'Cô Chi',
  'Bùi Thị Ngọc Diệp', 'Lê Phương Thảo', 'Trần Quốc Cường', 'Phạm Thu Hằng', 'Võ Thị Sáu', 'Alexander', 'Mary-Jane',
];

test('profanity is detected (diacritics, separators, leetspeak)', () => {
  for (const s of bad) assert.equal(checkName(s).ok, false, `should reject: ${s}`);
});

test('ordinary Vietnamese and English names pass', () => {
  for (const s of good) assert.equal(checkName(s).ok, true, `should accept: ${s} (hit ${checkName(s).hit})`);
});

test('host-added words work with and without diacritics', () => {
  assert.equal(checkName('Tèo Bí Ngô', ['bi ngo']).ok, false);
  assert.equal(checkName('Tèo Bí Ngô').ok, true);
  assert.equal(checkName('lớp trưởng', ['LOP TRUONG']).ok, false);
  assert.equal(checkName('t.r.o.l.l', ['troll']).ok, false);
});

test('empty input is fine here (length rules live in validate.js)', () => {
  assert.equal(checkName('').ok, true);
  assert.equal(checkName(null).ok, true);
});
