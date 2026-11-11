// Real check of the AI round trip.
//   node tools/ai-roundtrip.mjs            builds tools/out/ai-roundtrip-prompt.txt and prints it
//   node tools/ai-roundtrip.mjs --verify   imports tools/fixtures/ai-roundtrip.txt (the reply an external AI wrote)
//                                          and asserts the selection, the injection rejection, prefilled scores and the script pages
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { assignIds, buildPrompt, parseAiResult, scriptPages } from '../js/lib/ai.js';
import { looksLikeInjection } from '../js/lib/answer-tools.js';
import { SCENARIOS } from '../js/data/scenarios.js';
import { teamList, defaultTeams } from '../js/lib/teams.js';
import { DEFAULT_SETTINGS } from '../js/lib/settings.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(readFileSync(join(here, 'fixtures/ai-roundtrip-answers.json'), 'utf8'));
const q = SCENARIOS.find((s) => s.id === fx.questionId);
const teams = Object.fromEntries(teamList(defaultTeams(4)).map((t) => [t.id, t.name]));

const answers = fx.answers.map((a, i) => ({ ...a, t0: 1000 + i }));
const idOf = assignIds(answers);
const items = answers.map((a) => ({ id: idOf[a.uid], name: a.name, team: teams[a.team], text: a.text }));
const S = DEFAULT_SETTINGS;
const prompt = buildPrompt({ question: q, criteria: q.criteria, items, n: S.aiN, maxScore: S.maxScore, step: S.scoreStep, hideNames: S.aiHideNames, includeCriteria: S.aiCriteria });

mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out/ai-roundtrip-prompt.txt'), prompt.text);

if (!process.argv.includes('--verify')) {
  console.log(prompt.text);
  console.error(`\n[prompt: ${prompt.text.length} characters, ${prompt.count} answers] -> tools/out/ai-roundtrip-prompt.txt`);
  process.exit(0);
}

const replyPath = join(here, 'fixtures/ai-roundtrip.txt');
if (!existsSync(replyPath)) { console.error('missing tools/fixtures/ai-roundtrip.txt'); process.exit(2); }
const reply = readFileSync(replyPath, 'utf8');
const flagged = items.filter((it) => looksLikeInjection(it.text)).map((it) => it.id);
const parsed = parseAiResult(reply, { validIds: items.map((i) => i.id), blockedIds: flagged, maxScore: S.maxScore, step: S.scoreStep, n: S.aiN });

let ok = true;
const check = (label, cond, extra = '') => { ok &&= !!cond; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); };
const sel = parsed.selected.map((s) => s.id);
check('reply is JSON (not free text)', parsed.status === 'json');
check('only the injection answer is flagged by the app heuristic (no false positives)', flagged.join() === 'P05', flagged.join());
check('selected 4 answers', sel.length === 4, sel.join(', '));
check('selected the strong answers P01, P04, P09, P12', ['P01', 'P04', 'P09', 'P12'].every((id) => sel.includes(id)));
check('did not select jokes P02/P11, hollow P03/P08, weak P10', ['P02', 'P11', 'P03', 'P08', 'P10'].every((id) => !sel.includes(id)));
check('injection P05 is NOT selected', !sel.includes('P05'));
check('injection P05 is in rejected', parsed.rejected.some((r) => r.id === 'P05'), parsed.rejected.find((r) => r.id === 'P05')?.reason);
check('jokes and hollow answers are rejected with reasons', ['P02', 'P11', 'P03', 'P08'].every((id) => parsed.rejected.find((r) => r.id === id)?.reason));
check('every selected answer has a highlight of at most 25 words', parsed.selected.every((s) => s.highlight && s.highlight.split(/\s+/).length <= 25));
check('suggested scores are prefilled on the 0.5 grid within 0..10', parsed.selected.every((s) => s.suggestedScore != null && s.suggestedScore >= 0 && s.suggestedScore <= 10 && (s.suggestedScore * 2) % 1 === 0), parsed.selected.map((s) => s.suggestedScore).join(', '));
check('no warnings that signal a broken reply', !parsed.warnings.some((w) => ['unknown-id', 'duplicate-id', 'conflict', 'injection-selected', 'missing-id'].includes(w.code)), parsed.warnings.map((w) => w.code).join(','));
const optionNo = (id) => sel.indexOf(id) + 1 || null;
const pages = scriptPages(parsed, optionNo);
check('script: opening + one page per selected option + closing', pages.length === 6, pages.map((p) => p.title).join(' | '));
check('each option speech is 60-120 words', parsed.script.perOption.every((p) => { const n = p.speech.split(/\s+/).length; return n >= 60 && n <= 120; }), parsed.script.perOption.map((p) => p.speech.split(/\s+/).length).join(', '));
check('speeches address "các bạn"', parsed.script.perOption.every((p) => /các bạn/i.test(p.speech)));
console.log(ok ? '\nAI round trip: PASS' : '\nAI round trip: FAIL');
process.exit(ok ? 0 : 1);
