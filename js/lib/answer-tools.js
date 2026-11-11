// Helpers for the host's answer list: Vietnamese-insensitive search, filters, near-duplicate flags and
// a heuristic that spots answers trying to instruct the AI judge. Pure.

/** lower-case, no diacritics (đ -> d), punctuation collapsed: "Mình sẽ nói" -> "minh se noi" */
export function fold(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const words = (s) => fold(s).split(' ').filter(Boolean);

/** Jaccard similarity of word unigrams + bigrams (0..1). */
export function similarity(a, b) {
  const grams = (t) => {
    const w = words(t);
    const set = new Set(w);
    for (let i = 0; i < w.length - 1; i++) set.add(`${w[i]}_${w[i + 1]}`);
    return set;
  };
  const A = grams(a); const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * @param {{uid:string,text:string}[]} items
 * @returns {Map<string,string[]>} uid -> uids of near-duplicates (only entries that have at least one)
 */
export function findNearDuplicates(items, threshold = 0.6) {
  const out = new Map();
  const folded = items.map((it) => fold(it.text));
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const same = folded[i] && folded[i] === folded[j];
      if (same || similarity(items[i].text, items[j].text) >= threshold) {
        (out.get(items[i].uid) || out.set(items[i].uid, []).get(items[i].uid)).push(items[j].uid);
        (out.get(items[j].uid) || out.set(items[j].uid, []).get(items[j].uid)).push(items[i].uid);
      }
    }
  }
  return out;
}

// Patterns run on fold()ed text (no diacritics, punctuation -> spaces) so Vietnamese spelling variants all match.
const INJECTION_FOLDED = [
  /\bbo qua .{0,20}(huong dan|chi dan|quy tac|yeu cau)/,
  /\bignore .{0,25}(instruction|rule|prompt|above|previous)/,
  /\b(system|developer) prompt/,
  /\b(hay|phai|can|please|must|should) (chon|cham|cho|select|choose|pick|rate|score|give) .{0,50}(bai nay|cau tra loi nay|this (answer|one|response)|diem toi da|full marks|max score|10 10)/,
  /\b(chon|cham|select|choose|pick|rate) .{0,20}(bai nay|this (answer|one|response)) .{0,30}(nhat|diem|best|top|first|10)/,
  /\b(gpt|chatgpt|gemini|claude|model|giam khao|nguoi cham|ban la ai) .{0,25}\b(phai|hay|must|should|need to)\b/,
  /\bp\d{2,3} .{0,30}\b(chon|select|best|nhat)\b/,
];
// Patterns that need the original punctuation.
const INJECTION_RAW = [/["']?(selected|rejected|suggestedscore|hostscript)["']?\s*:/i];

/** True when the text looks like it is talking to the judge instead of answering the situation. */
export function looksLikeInjection(text) {
  const raw = String(text ?? '');
  const f = fold(raw);
  return INJECTION_FOLDED.some((re) => re.test(f)) || INJECTION_RAW.some((re) => re.test(raw));
}

/** Filters used by the answer list. `rv` is the review doc of the answer (st = chosen | rejected). */
export function matchesFilter(item, { filter = 'all', team = '', query = '' }, rv) {
  if (filter === 'chosen' && rv?.st !== 'chosen') return false;
  if (filter === 'rejected' && rv?.st !== 'rejected') return false;
  if (filter === 'open' && rv?.st) return false;
  if (team && item.team !== team) return false;
  const q = fold(query);
  if (q && !fold(`${item.text} ${item.name ?? ''}`).includes(q)) return false;
  return true;
}
