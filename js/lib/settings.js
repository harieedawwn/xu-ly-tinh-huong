// Room settings: defaults, the allowed ranges (shared with the database rules generator) and a sanitizer.
// Pure. tools/build-rules.mjs imports SETTING_SPECS so the rules and the UI can never disagree.
import { defaultTeams, MIN_TEAMS, MAX_TEAMS } from './teams.js';

export const DEFAULT_SETTINGS = Object.freeze({
  // Phòng
  mode: 'all', // 'all' = Cả lớp, 'team' = Đại diện tổ
  lockJoin: false,
  // Thời gian
  defaultSecs: 120,
  addMs: 30000,
  // Bài nộp
  minChars: 20,
  maxChars: 800,
  allowEdit: true,
  autoSubmit: true,
  graceMs: 3000,
  // AI
  aiN: 4,
  aiHideNames: false,
  aiCriteria: true,
  // Bình chọn
  phoneVoting: true,
  liveTally: false,
  // Chấm điểm
  maxScore: 10,
  scoreStep: 0.5,
  formula: 'host', // 'host' | 'mix' | 'votes'
  voteWeight: 50, // percent of the final score that comes from votes when formula = 'mix'
  awardTop: 1, // 1 or 3
  teamAward: 'sum', // 'sum' | 'place'
  // TV
  tvTheme: 'light',
  tvSize: 'M',
  tvSound: false,
  tvQr: true,
});

const num = (min, max, extra = {}) => ({ type: 'number', min, max, ...extra });
const oneOf = (...values) => ({ type: 'enum', values });
const bool = () => ({ type: 'bool' });

export const SETTING_SPECS = Object.freeze({
  mode: oneOf('all', 'team'),
  lockJoin: bool(),
  defaultSecs: num(10, 3600),
  addMs: num(5000, 300000),
  minChars: num(1, 1000),
  maxChars: num(20, 2000),
  allowEdit: bool(),
  autoSubmit: bool(),
  graceMs: num(0, 10000),
  aiN: num(1, 12),
  aiHideNames: bool(),
  aiCriteria: bool(),
  phoneVoting: bool(),
  liveTally: bool(),
  maxScore: num(1, 1000),
  scoreStep: { type: 'number', min: 0.5, max: 1, values: [0.5, 1] },
  formula: oneOf('host', 'mix', 'votes'),
  voteWeight: num(0, 100),
  awardTop: { type: 'number', min: 1, max: 3, values: [1, 3] },
  teamAward: oneOf('sum', 'place'),
  tvTheme: oneOf('light', 'dark'),
  tvSize: oneOf('S', 'M', 'L', 'XL'),
  tvSound: bool(),
  tvQr: bool(),
});

export const MAX_BAD_WORDS = 60;
export const TEAM_NAME_MAX = 20;

/** Merge stored settings over the defaults (rooms created before stage 2 lack the new keys). */
export function withDefaults(s) {
  const out = { ...DEFAULT_SETTINGS, ...(s || {}) };
  if (!out.teams) out.teams = defaultTeams();
  out.badWords = Array.isArray(s?.badWords) ? s.badWords : s?.badWords && typeof s.badWords === 'object' ? Object.values(s.badWords) : [];
  return out;
}

/** @returns {{ok:true,value:any}|{ok:false}} a value that satisfies the spec for `key` (numbers are clamped) */
export function sanitizeSetting(key, raw) {
  const spec = SETTING_SPECS[key];
  if (!spec) return { ok: false };
  if (spec.type === 'bool') return typeof raw === 'boolean' ? { ok: true, value: raw } : { ok: false };
  if (spec.type === 'enum') return spec.values.includes(raw) ? { ok: true, value: raw } : { ok: false };
  const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return { ok: false };
  if (spec.values) return spec.values.includes(n) ? { ok: true, value: n } : { ok: false };
  return { ok: true, value: Math.min(spec.max, Math.max(spec.min, n)) };
}

/** Answer limits must stay consistent: min <= max. Returns a corrected pair. */
export function fixLimits({ minChars, maxChars }) {
  const max = Math.max(20, maxChars);
  return { minChars: Math.min(minChars, max), maxChars: max };
}

export const clampTeamCount = (n) => Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.round(Number(n) || 0)));

/** Host-added profanity: lowercase, trimmed, 2..30 chars, de-duplicated, capped. */
export function cleanBadWords(list) {
  const seen = new Set();
  const out = [];
  for (const w of list || []) {
    const t = String(w ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
    if (t.length < 2 || t.length > 30 || seen.has(t)) continue;
    seen.add(t); out.push(t);
    if (out.length >= MAX_BAD_WORDS) break;
  }
  return out;
}

/** Team-count change: new teams map, plus the players that must move because their tổ disappears. */
export function resizeTeams(currentTeams, players, count) {
  const n = clampTeamCount(count);
  const fresh = defaultTeams(n);
  const teams = {};
  for (const id of Object.keys(fresh)) teams[id] = { name: currentTeams?.[id]?.name || fresh[id].name };
  const moves = [];
  for (const [uid, p] of Object.entries(players || {})) if (!teams[p.team]) moves.push({ uid, from: p.team, to: 't1' });
  return { teams, moves };
}
