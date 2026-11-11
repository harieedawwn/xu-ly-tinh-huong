// Validation of names and answers. Pure functions; UI maps error codes to Vietnamese copy.
import { checkName } from './namefilter.js';

export const NAME_MIN = 2;
export const NAME_MAX = 24;
export const ANSWER_MIN_DEFAULT = 20;
export const ANSWER_MAX_DEFAULT = 800;

/* eslint-disable no-control-regex */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g;

export function cleanName(raw) {
  return String(raw ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

/** @returns {{ok:true,value:string}|{ok:false,error:'empty'|'short'|'long'|'profane'}} */
export function validateName(raw, { extra = [] } = {}) {
  const value = cleanName(raw);
  if (!value) return { ok: false, error: 'empty' };
  if ([...value].length < NAME_MIN) return { ok: false, error: 'short' };
  if (value.length > NAME_MAX) return { ok: false, error: 'long' };
  if (!checkName(value, extra).ok) return { ok: false, error: 'profane' };
  return { ok: true, value };
}

const foldName = (s) => cleanName(s).toLowerCase();

/** "An" -> "An (2)" when taken; keeps the result within NAME_MAX. */
export function uniqueName(name, existing) {
  const taken = new Set(existing.map(foldName));
  if (!taken.has(foldName(name))) return name;
  for (let n = 2; n < 1000; n++) {
    const suffix = ` (${n})`;
    const base = name.length + suffix.length > NAME_MAX ? name.slice(0, NAME_MAX - suffix.length).trimEnd() : name;
    const candidate = base + suffix;
    if (!taken.has(foldName(candidate))) return candidate;
  }
  return name;
}

/** Normalise line endings and edge whitespace; keeps the student's own line breaks. */
export function cleanAnswer(raw) {
  return String(raw ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(INVISIBLE_KEEP_NL, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
}
// control chars except \n and \t
const INVISIBLE_KEEP_NL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g;

/** True for "aaaaaaaa", "hahahahaha", "asdasdasdasd", very few distinct characters, or one word repeated. */
export function looksLikeSpam(text) {
  const t = text.replace(/\s+/g, '').toLowerCase();
  if (t.length < 12) return false;
  if (/(.{1,4})\1{4,}/su.test(t)) return true;
  if (new Set([...t]).size < 6 && t.length >= 20) return true;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 8 && new Set(words).size / words.length < 0.3) return true;
  return false;
}

/**
 * @returns {{ok:true,value:string}|{ok:false,error:'empty'|'short'|'long'|'spam'}}
 * `value` is the cleaned text that must be stored; lengths follow the database rule (UTF-16 units).
 */
export function validateAnswer(raw, { min = ANSWER_MIN_DEFAULT, max = ANSWER_MAX_DEFAULT } = {}) {
  const value = cleanAnswer(raw);
  if (!value.replace(/\s/g, '')) return { ok: false, error: 'empty' };
  if (value.length < min) return { ok: false, error: 'short' };
  if (value.length > max) return { ok: false, error: 'long' };
  if (looksLikeSpam(value)) return { ok: false, error: 'spam' };
  return { ok: true, value };
}
