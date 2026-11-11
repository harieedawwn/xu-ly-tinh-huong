// Tổ (team) palette and helpers. Text colours are measured, not guessed.
import { pickText, contrast } from './color.js';

export const INK = '#111111';
export const PAPER = '#F4F1EA';
export const TEAM_COLORS = ['#FF5A36', '#2D6BFF', '#FFC800', '#19B46B', '#8A4DFF', '#00A3B8'];
export const MAX_TEAMS = 6;
export const MIN_TEAMS = 2;
export const DEFAULT_TEAMS = 4;

export const teamId = (i) => `t${i + 1}`;
export const teamIndex = (id) => Number(String(id).slice(1)) - 1;

export function defaultTeams(count = DEFAULT_TEAMS) {
  const n = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, count));
  const out = {};
  for (let i = 0; i < n; i++) out[teamId(i)] = { name: `Tổ ${i + 1}` };
  return out;
}

export function teamColor(id) {
  return TEAM_COLORS[teamIndex(id)] ?? INK;
}

export function teamTextColor(id) {
  return pickText(teamColor(id), INK, '#FFFFFF');
}

export function teamContrast(id) {
  return contrast(teamColor(id), teamTextColor(id));
}

/** Ordered list [{id,name,color,on}] from the settings.teams map. */
export function teamList(teamsMap) {
  return Object.keys(teamsMap || {})
    .sort((a, b) => teamIndex(a) - teamIndex(b))
    .map((id) => ({ id, name: teamsMap[id]?.name || `Tổ ${teamIndex(id) + 1}`, color: teamColor(id), on: teamTextColor(id) }));
}
