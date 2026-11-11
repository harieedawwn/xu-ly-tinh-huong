import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, SETTING_SPECS, sanitizeSetting, withDefaults, fixLimits, cleanBadWords, resizeTeams, clampTeamCount } from '../../js/lib/settings.js';

test('every default satisfies its own spec', () => {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    assert.ok(SETTING_SPECS[k], `spec for ${k}`);
    assert.deepEqual(sanitizeSetting(k, v), { ok: true, value: v }, k);
  }
});

test('sanitize: clamps numbers, restricts enums and fixed sets, parses strings', () => {
  assert.equal(sanitizeSetting('maxScore', '25').value, 25);
  assert.equal(sanitizeSetting('maxScore', 99999).value, 1000);
  assert.equal(sanitizeSetting('maxScore', 0).value, 1);
  assert.equal(sanitizeSetting('maxScore', 'x').ok, false);
  assert.equal(sanitizeSetting('scoreStep', 0.5).ok, true);
  assert.equal(sanitizeSetting('scoreStep', 0.7).ok, false);
  assert.equal(sanitizeSetting('awardTop', 3).ok, true);
  assert.equal(sanitizeSetting('awardTop', 2).ok, false);
  assert.equal(sanitizeSetting('formula', 'mix').ok, true);
  assert.equal(sanitizeSetting('formula', 'median').ok, false);
  assert.equal(sanitizeSetting('tvSound', 'yes').ok, false);
  assert.equal(sanitizeSetting('nope', 1).ok, false);
});

test('withDefaults fills rooms created in stage 1', () => {
  const s = withDefaults({ mode: 'team', minChars: 30, teams: { t1: { name: 'A' }, t2: { name: 'B' } } });
  assert.equal(s.mode, 'team');
  assert.equal(s.minChars, 30);
  assert.equal(s.maxScore, 10);
  assert.deepEqual(s.badWords, []);
  assert.equal(Object.keys(withDefaults(null).teams).length, 4);
  assert.deepEqual(withDefaults({ badWords: { 0: 'a1', 1: 'b2' } }).badWords, ['a1', 'b2']);
});

test('limits stay consistent; bad words are cleaned and capped', () => {
  assert.deepEqual(fixLimits({ minChars: 500, maxChars: 100 }), { minChars: 100, maxChars: 100 });
  assert.deepEqual(cleanBadWords([' Xấu  Xa ', 'xấu xa', 'a', '', null, 'x'.repeat(40), 'ok']), ['xấu xa', 'ok']);
  assert.equal(cleanBadWords(Array.from({ length: 200 }, (_, i) => `từ${i}`)).length, 60);
});

test('resizeTeams keeps names, and lists the players who must move out of removed tổ', () => {
  const teams = { t1: { name: 'Sao' }, t2: { name: 'Biển' }, t3: { name: 'Núi' }, t4: { name: 'Rừng' } };
  const r = resizeTeams(teams, { a: { team: 't1' }, b: { team: 't4' }, c: { team: 't3' } }, 2);
  assert.deepEqual(Object.keys(r.teams), ['t1', 't2']);
  assert.equal(r.teams.t1.name, 'Sao');
  assert.deepEqual(r.moves.map((m) => m.uid).sort(), ['b', 'c']);
  assert.ok(r.moves.every((m) => m.to === 't1'));
  const up = resizeTeams({ t1: { name: 'A' }, t2: { name: 'B' } }, {}, 6);
  assert.equal(Object.keys(up.teams).length, 6);
  assert.equal(up.teams.t5.name, 'Tổ 5');
  assert.equal(clampTeamCount(1), 2);
  assert.equal(clampTeamCount(9), 6);
});
