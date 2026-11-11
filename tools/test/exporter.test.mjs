import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv, resultsCsv, boardCsv, resultsJson, BOM, fileStamp } from '../../js/lib/exporter.js';

test('csvCell quotes commas, quotes and line breaks', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('nói "thật"'), '"nói ""thật"""');
  assert.equal(csvCell('dòng 1\ndòng 2'), '"dòng 1\ndòng 2"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(8.5), '8.5');
  assert.equal(csvCell(-2), '-2', 'plain negative numbers stay numbers');
});

test('csvCell neutralises spreadsheet formulas in student text', () => {
  for (const f of ['=1+1', '+cmd|calc', '-2+3', '@SUM(A1)', '=HYPERLINK("http://x")']) assert.ok(csvCell(f).replace(/^"/, '').startsWith("'"), f);
});

test('CSV starts with a UTF-8 BOM, uses CRLF and keeps Vietnamese intact', () => {
  const out = toCsv(['Tên', 'Điểm'], [['Nguyễn Văn Ánh', 9], ['Đặng, Hà', 8.5]]);
  assert.equal(out.charCodeAt(0), 0xfeff);
  assert.equal(out.slice(0, 1), BOM);
  assert.equal(out.slice(1), 'Tên,Điểm\r\nNguyễn Văn Ánh,9\r\n"Đặng, Hà",8.5\r\n');
  assert.equal(Buffer.from(out, 'utf8').subarray(0, 3).toString('hex'), 'efbbbf');
});

const awards = {
  r2: { at: 20, question: 'Câu 2', items: [{ n: 0, rank: 1, name: 'Hà', team: 't2', hostScore: 9, votes: 3, value: 9, points: 9, honoured: true, text: '=cmd' }] },
  r1: { at: 10, question: 'Câu 1', items: [{ n: 1, rank: 2, name: 'Lan', team: 't1', hostScore: 7, votes: 1, value: 7, points: 7, honoured: false, text: 'Bài, "hay"' }] },
};

test('results CSV: rounds in time order, tổ names, option numbers 1-based, no formula injection', () => {
  const csv = resultsCsv(awards, { t1: { name: 'Tổ 1' }, t2: { name: 'Tổ Sao' } });
  const lines = csv.slice(1).split('\r\n');
  assert.match(lines[0], /^Vòng,Tình huống,Hạng/);
  assert.match(lines[1], /^r1,Câu 1,2,2,Lan,Tổ 1,7,1,7,7,,"Bài, ""hay"""$/);
  assert.match(lines[2], /^r2,Câu 2,1,1,Hà,Tổ Sao,9,3,9,9,x,'=cmd$/);
});

test('board CSV and JSON export', () => {
  const csv = boardCsv({ teamRows: [{ rank: 1, name: 'Tổ 2', points: 12 }], playerRows: [{ rank: 1, name: 'Hà', team: 'Tổ 2', points: 9 }] });
  assert.match(csv, /Tổ,1,Tổ 2,Tổ 2,12/);
  assert.match(csv, /Cá nhân,1,Hà,Tổ 2,9/);
  const j = JSON.parse(resultsJson({ code: 'ABC234', settings: { maxScore: 10 }, awards, adjustments: null, board: null, exportedAt: 'x' }));
  assert.equal(j.room, 'ABC234');
  assert.equal(Object.keys(j.rounds).length, 2);
  assert.deepEqual(j.board, { t: {}, p: {} });
  assert.match(fileStamp(new Date('2026-11-11T12:34:56Z')), /^20261111\d{4}$/);
});
