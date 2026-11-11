import test from 'node:test';
import assert from 'node:assert/strict';
import { contrast, luminance, pickText } from '../../js/lib/color.js';
import { teamList, teamTextColor, teamContrast, defaultTeams, TEAM_COLORS, INK, PAPER } from '../../js/lib/teams.js';

test('contrast basics', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF')), 21);
  assert.equal(contrast('#123456', '#123456'), 1);
  assert.ok(luminance('#FFFFFF') > luminance('#111111'));
});

test('text on every tổ colour has a measured contrast of at least 4.5', () => {
  for (const id of ['t1', 't2', 't3', 't4', 't5', 't6']) {
    assert.ok(teamContrast(id) >= 4.5, `${id} ${teamTextColor(id)} ${teamContrast(id).toFixed(2)}`);
  }
});

test('expected text colours for the four default tổ colours', () => {
  assert.equal(pickText('#FF5A36'), INK);
  assert.equal(pickText('#FFC800'), INK);
  assert.equal(pickText('#19B46B'), INK);
  assert.equal(pickText('#2D6BFF'), '#FFFFFF');
});

test('ink on paper passes AAA', () => {
  assert.ok(contrast(INK, PAPER) >= 7);
});

test('teams helpers', () => {
  assert.deepEqual(Object.keys(defaultTeams()), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(Object.keys(defaultTeams(9)).length, 6);
  assert.deepEqual(Object.keys(defaultTeams(1)).length, 2);
  const l = teamList({ t2: { name: 'Sói' }, t1: { name: 'Hổ' } });
  assert.equal(l[0].id, 't1');
  assert.equal(l[1].name, 'Sói');
  assert.equal(l[0].color, TEAM_COLORS[0]);
});
