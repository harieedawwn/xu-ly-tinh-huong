// Display-name filter: Vietnamese + English profanity, tolerant of missing diacritics,
// separators between letters ("d.i.t m.e", "f u c k") and leetspeak ("sh1t").
// Pure and dependency free. Host-added words are passed in as `extra`.
//
// Matching layers:
//  1. diacritic-exact tokens (ambiguous once diacritics are stripped, e.g. "cặc" vs "các")
//  2. whole-token matches for short/abbreviated terms ("dm", "vcl", "dick")
//  3. phrase matches on the token stream ("dit me", "oc cho")
//  4. letters spaced apart ("c a c") collapse and are checked against every term
//  5. compact substring matches (separators removed) for long, distinctive terms

const stripMarks = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't', '¡': 'i' };
const leet = (s) => s.replace(/[0134578@$!|+¡]/g, (c) => LEET[c] ?? c);
const squeeze = (s) => s.replace(/(.)\1+/gu, '$1');

// Tokens that are only profane WITH their diacritics (without them they are common words).
const DIACRITIC_TOKENS = new Set(['cặc', 'lồn', 'buồi', 'đéo', 'địt', 'đụ', 'đĩ', 'đít', 'cứt']);

// Whole-token terms (diacritics already stripped).
const WORD_TERMS = new Set([
  'ditme', 'dume', 'duma', 'dm', 'dmm', 'dcm', 'dkm', 'dmcs', 'dcll', 'vcl', 'vkl', 'vl', 'cl', 'clgt', 'cc', 'cmm', 'vcc',
  'fuck', 'fck', 'fuk', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'dick', 'cock', 'ass', 'asshole',
  'pussy', 'cunt', 'slut', 'whore', 'bastard', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'porn', 'sex', 'cum', 'dumbass',
  'stfu', 'penis', 'vagina',
]);

// Phrases (space separated, diacritics stripped), matched on the token stream.
const PHRASES = [
  'dit me', 'dit con me', 'dit cu', 'dit bo', 'du ma', 'du me', 'con cac', 'me may', 'oc cho', 'thang cho', 'con cho',
  'do cho', 'cho chet', 'cho de', 'suc vat', 'khon nan', 'mat day', 'do ngu', 'thang ngu', 'con ngu', 'dit con', 'lon me',
  'cac me', 'bo may', 'dit may', 'du may',
];

// Long, distinctive terms checked against the separator-free string.
const COMPACT_TERMS = [
  'dumemay', 'dumamay', 'ditmemay', 'ditconme', 'ditconbamay', 'concac', 'thangcho', 'occho', 'sucvat', 'khonnan', 'matday',
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'pussy', 'asshole', 'bastard', 'motherfucker',
];
const COMPACT_SQ = COMPACT_TERMS.map(squeeze);

const tokenize = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);

function hitSpaced(tokens, extraNorm) {
  // runs of >= 3 single-character tokens: "c a c", "d.i.t.m.e"
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      const j = run.join('');
      if (WORD_TERMS.has(j) || PHRASES.some((p) => p.replace(/ /g, '') === j) || extraNorm.some((w) => w.replace(/ /g, '') === j)) return j;
      if (j.length >= 3) {
        if (COMPACT_SQ.some((t) => squeeze(j).includes(t))) return j;
      }
    }
    run = [];
    return null;
  };
  for (const t of tokens) {
    if (t.length === 1) run.push(t);
    else {
      const h = flush();
      if (h) return h;
      run = [];
    }
  }
  return flush();
}

/**
 * @param {string} input display name or any short text
 * @param {string[]} [extra] words added by the host
 * @returns {{ok:boolean, hit?:string}}
 */
export function checkName(input, extra = []) {
  const raw = String(input ?? '').normalize('NFC').toLowerCase();
  if (!raw.trim()) return { ok: true };

  // 1. diacritic-exact tokens
  for (const t of raw.split(/[^\p{L}\p{N}]+/u)) if (t && DIACRITIC_TOKENS.has(t)) return { ok: false, hit: t };

  const base = leet(stripMarks(raw));
  const tokens = tokenize(base);
  const extraNorm = extra.map((w) => leet(stripMarks(String(w).normalize('NFC').toLowerCase())).replace(/[^a-z0-9 ]+/g, ' ').trim()).filter((w) => w.length >= 2);

  // 2. whole tokens
  for (const t of tokens) if (WORD_TERMS.has(t)) return { ok: false, hit: t };
  // 3. phrases on the token stream (also host words)
  const stream = ` ${tokens.join(' ')} `;
  for (const p of PHRASES) if (stream.includes(` ${p} `)) return { ok: false, hit: p };
  for (const w of extraNorm) if (stream.includes(` ${w} `)) return { ok: false, hit: w };
  // 4. spaced-out letters
  const sp = hitSpaced(tokens, extraNorm);
  if (sp) return { ok: false, hit: sp };
  // 5. compact substrings
  const compact = tokens.join('');
  if (WORD_TERMS.has(compact)) return { ok: false, hit: compact };
  const csq = squeeze(compact);
  for (let i = 0; i < COMPACT_TERMS.length; i++) if (csq.includes(COMPACT_SQ[i])) return { ok: false, hit: COMPACT_TERMS[i] };
  for (const w of extraNorm) {
    const wc = w.replace(/ /g, '');
    if (wc.length >= 3 && compact.includes(wc)) return { ok: false, hit: w };
  }
  return { ok: true };
}

export const isCleanName = (input, extra) => checkName(input, extra).ok;
