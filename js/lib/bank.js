// Question bank: pure operations on an array of { id, title, text, criteria[], time }. Export / import as JSON.
import { SCENARIOS } from '../data/scenarios.js';

export const BANK_MAX = 40;
export const LIMITS = { title: 80, textMin: 20, textMax: 2000, criteria: 8, criterion: 300, timeMin: 10, timeMax: 3600 };

const clone = (x) => JSON.parse(JSON.stringify(x));
export const defaultBank = () => SCENARIOS.map((s) => clone({ id: s.id, title: s.title, text: s.text, criteria: s.criteria, time: s.time }));

/** Database values come back as objects or sparse arrays; make them a clean array again. */
export function normalizeBank(v) {
  if (v == null) return [];
  const list = Array.isArray(v) ? v : Object.keys(v).sort((a, b) => Number(a) - Number(b)).map((k) => v[k]);
  return list.filter((q) => q && typeof q === 'object').map((q) => ({
    id: String(q.id ?? ''), title: String(q.title ?? ''), text: String(q.text ?? ''),
    criteria: Array.isArray(q.criteria) ? q.criteria.map(String) : q.criteria && typeof q.criteria === 'object' ? Object.values(q.criteria).map(String) : [],
    time: Number(q.time) || 120,
  })).filter((q) => q.id);
}

/** @returns {{ok:true,value:object}|{ok:false,errors:string[]}} */
export function validateQuestion(q) {
  const errors = [];
  const title = String(q?.title ?? '').replace(/\s+/g, ' ').trim();
  const text = String(q?.text ?? '').replace(/\r\n?/g, '\n').trim();
  const criteria = (Array.isArray(q?.criteria) ? q.criteria : String(q?.criteria ?? '').split('\n')).map((c) => String(c).trim()).filter(Boolean);
  const time = Math.round(Number(q?.time));
  if (!title) errors.push('title');
  else if (title.length > LIMITS.title) errors.push('titleLong');
  if (text.length < LIMITS.textMin) errors.push('textShort');
  else if (text.length > LIMITS.textMax) errors.push('textLong');
  if (criteria.length > LIMITS.criteria) errors.push('criteriaMany');
  if (criteria.some((c) => c.length > LIMITS.criterion)) errors.push('criterionLong');
  if (!(time >= LIMITS.timeMin && time <= LIMITS.timeMax)) errors.push('time');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { id: String(q.id ?? ''), title, text, criteria, time } };
}

export const newId = (taken, rnd = Math.random) => {
  const used = new Set(taken);
  for (let i = 0; i < 50; i++) {
    const id = `q${Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0')}`;
    if (!used.has(id)) return id;
  }
  return `q${Date.now().toString(36)}`;
};

const ids = (bank) => bank.map((q) => q.id);

export function addQuestion(bank, q, rnd) {
  if (bank.length >= BANK_MAX) return { ok: false, errors: ['full'] };
  const v = validateQuestion(q);
  if (!v.ok) return v;
  const id = newId(ids(bank), rnd);
  return { ok: true, bank: [...bank, { ...v.value, id }], id };
}

export function updateQuestion(bank, id, patch) {
  const i = bank.findIndex((q) => q.id === id);
  if (i < 0) return { ok: false, errors: ['missing'] };
  const v = validateQuestion({ ...bank[i], ...patch, id });
  if (!v.ok) return v;
  const next = bank.slice();
  next[i] = v.value;
  return { ok: true, bank: next };
}

export function deleteQuestion(bank, id) {
  if (!bank.some((q) => q.id === id)) return { ok: false, errors: ['missing'] };
  return { ok: true, bank: bank.filter((q) => q.id !== id) };
}

export function duplicateQuestion(bank, id, rnd) {
  const i = bank.findIndex((q) => q.id === id);
  if (i < 0) return { ok: false, errors: ['missing'] };
  if (bank.length >= BANK_MAX) return { ok: false, errors: ['full'] };
  const src = bank[i];
  const title = `${src.title} (bản sao)`.slice(0, LIMITS.title);
  const copy = { ...clone(src), title, id: newId(ids(bank), rnd) };
  const next = bank.slice();
  next.splice(i + 1, 0, copy);
  return { ok: true, bank: next, id: copy.id };
}

/** Move one question by `delta` positions (-1 up, +1 down); clamps at the ends. */
export function moveQuestion(bank, id, delta) {
  const i = bank.findIndex((q) => q.id === id);
  if (i < 0) return { ok: false, errors: ['missing'] };
  const j = Math.min(bank.length - 1, Math.max(0, i + delta));
  if (j === i) return { ok: true, bank };
  const next = bank.slice();
  const [q] = next.splice(i, 1);
  next.splice(j, 0, q);
  return { ok: true, bank: next };
}

export const exportBank = (bank) => JSON.stringify({ app: 'xu-ly-tinh-huong', kind: 'question-bank', version: 1, questions: bank }, null, 2);

/**
 * Import a bank file. mode 'merge' appends (fresh ids when they collide), 'replace' swaps the whole bank.
 * @returns {{ok:true,bank:object[],added:number,skipped:number}|{ok:false,error:string}}
 */
export function importBank(text, current, { mode = 'merge', rnd } = {}) {
  let data;
  try { data = JSON.parse(String(text).replace(/^﻿/, '')); } catch { return { ok: false, error: 'json' }; }
  const list = Array.isArray(data) ? data : data?.questions;
  if (!Array.isArray(list)) return { ok: false, error: 'shape' };
  const out = mode === 'replace' ? [] : current.slice();
  let added = 0; let skipped = 0;
  for (const raw of list) {
    const v = validateQuestion(raw);
    if (!v.ok || out.length >= BANK_MAX) { skipped++; continue; }
    const wanted = String(raw?.id ?? '');
    const id = wanted && !out.some((q) => q.id === wanted) && /^[A-Za-z0-9_-]{1,24}$/.test(wanted) ? wanted : newId(ids(out), rnd);
    out.push({ ...v.value, id });
    added++;
  }
  if (added === 0) return { ok: false, error: 'empty' };
  return { ok: true, bank: out, added, skipped };
}
