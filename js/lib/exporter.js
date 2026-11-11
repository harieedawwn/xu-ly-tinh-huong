// Result exports: CSV (UTF-8 with BOM so Excel reads Vietnamese) and JSON. Pure string builders.

export const BOM = '﻿';

/** One CSV cell. Quotes and line breaks are escaped; cells that start with = + - @ are prefixed with ' so a
 *  spreadsheet never runs student text as a formula. */
export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

const teamName = (teams, id) => teams?.[id]?.name || id || '';

/** One row per showcased option per round. `awards` is private/awards (keyed by round id). */
export function resultsCsv(awards, teams) {
  const headers = ['Vòng', 'Tình huống', 'Hạng', 'Phương án', 'Tên', 'Tổ', 'Điểm Host', 'Phiếu', 'Điểm tổng', 'Điểm cộng', 'Được vinh danh', 'Nội dung'];
  const rows = [];
  const keys = Object.keys(awards || {}).sort((a, b) => (awards[a].at || 0) - (awards[b].at || 0) || a.localeCompare(b));
  for (const k of keys) {
    const a = awards[k];
    for (const it of a.items || []) {
      rows.push([k, a.question, it.rank, it.n + 1, it.name, teamName(teams, it.team), it.hostScore, it.votes, it.value, it.points, it.honoured ? 'x' : '', it.text]);
    }
  }
  return toCsv(headers, rows);
}

/** Leaderboards: first the tổ, then every player. */
export function boardCsv({ teamRows, playerRows }) {
  const headers = ['Bảng', 'Hạng', 'Tên', 'Tổ', 'Điểm'];
  const rows = [
    ...teamRows.map((r) => ['Tổ', r.rank, r.name, r.name, r.points]),
    ...playerRows.map((r) => ['Cá nhân', r.rank, r.name, r.team, r.points]),
  ];
  return toCsv(headers, rows);
}

export function resultsJson({ code, settings, awards, adjustments, board, exportedAt }) {
  return JSON.stringify({ app: 'xu-ly-tinh-huong', room: code, exportedAt, settings, rounds: awards || {}, adjustments: adjustments || {}, board: board || { t: {}, p: {} } }, null, 2);
}

export const fileStamp = (d = new Date()) => d.toISOString().slice(0, 16).replace(/[-:T]/g, '');
