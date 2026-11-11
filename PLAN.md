# Plan

| Stage | Scope | Status |
|---|---|---|
| 1 | Repo + Pages, Firebase data model and rules, design system, thin live loop on Home / Player / TV / Host | **Built and verified locally (emulator). Waiting for: rules deploy, Pages enable, live check.** |
| 2 | Full host pipeline (SPEC.md "Host features"): bank, AI export/import, showcase, voting, scoring, reveal, leaderboards, settings | **Built and verified on the emulator (real rules engine). Waiting for: the same rules deployed to the real database.** |
| 3 | Device hardening (Zalo, iPhone, Android, 4K), 42-player load test, offline queue, accessibility, review | Not started |

## Stage 1 evidence (2026-11-11)
- `npm test`: 36 unit tests. `rules-test.mjs` on the emulator: 174 checks. `e2e.mjs`: 43 checks.
- Real database: `rules-test.mjs` not yet run (rules must be deployed by the owner first). A real anonymous sign-in against the project succeeded, and unauthenticated reads are denied (401).

## Stage 2 evidence (2026-11-11, all on the Firebase emulators with the real rules engine and real Chromium)
- Backup taken first (`xlth-backup-stage1.tgz` of the stage-1 tree; the stage-1 commit `073a45b` is also on `main`).
- `npm test`: **115 unit tests** (36 from stage 1). New: phase transitions incl. two-host race with a serialising fake database, AI prompt builder and ids, AI parser against 11 fixtures (`tools/fixtures/parse/`: clean JSON, fenced JSON with prose before and after, smart quotes, trailing commas, Vietnamese text with quotes, unknown and duplicate ids, missing fields, free text with only P-ids, prose only, empty, injection selected), scoring/ranking/tie-break for the 3 formulas, tổ points for both award methods, undo, bank, answer tools, exporter (BOM, formula neutralising), settings, options.
- `rules-test.mjs --emulator`: **370 checks** (174 + 196 new): every new path (settings ranges, tổ names/count/moves, reps, bank, review, order, ids, AI import, optionOf, hand counts, awards, adjustments, showcase, vote, tally, reveal, board, reset, kick) with the exact payload builders the app uses, plus two Host devices racing a phase change through real transactions.
- `e2e.mjs` (stage-1 loop on the new UI): 43 checks.
- `e2e-s2.mjs`: **113 checks**, Host (390x844 phone), TV (1920x1080) and 3 players through two full rounds. Round 1 "Cả lớp": prompt copy (3 parts, ids, hide names, TXT/JSON download), AI reply with unescaped quotes and a trailing comma pasted, injection answer rejected, host script pages, showcase quick edit reaching TV and phones, reorder, focus, phone voting with own-option block, hand-raise, live tally on the TV, scoring prefilled from the AI, reveal with names, leaderboards, manual +1 with log, undo and re-award (no double count). Round 2 "Đại diện tổ": representative claim and Host reassignment, free-text AI reply pre-ticks, manual Chọn/Loại, tổ-mate vote block, mix formula (6.5 / 2.67), top 3 + placement points (Tổ 1 and Tổ 2 share rank 1 on 11), pause/resume/+30 s, two Host devices tapping "Khoá bài" in the same instant, double tap on the dock, settings groups, TV dark/XL, tổ count and names, banned word refused at join, CSV (BOM) and JSON exports, rename, kick, undo, reset points, end room.
- `perf-s2.mjs`: **24 checks**. 42 answers on an emulated phone with 4x CPU slow-down: first render 84 ms after sign-in, tick 44 ms, tab switch 61 ms, scroll 60 fps, no overflow. AI round trip in the UI with the 12 fake answers: ids, the prompt copied equals the exported prompt, import selects P01/P04/P09/P12, the injection P05 and the jokes/hollow answers are rejected, scores prefilled 9/8.5/8/7.5, host script has 6 pages. Clipboard-blocked fallback (select-all box) and Zalo user agent (download replaced by copy).
- AI round trip file check: `node tools/ai-roundtrip.mjs --verify` PASS. The reply in `tools/fixtures/ai-roundtrip.txt` was written by reading only the exported prompt (`tools/out/ai-roundtrip-prompt.txt`). The check found a real bug (the Vietnamese word "ai" = "anyone" made an honest answer look like an instruction to the judge); fixed and covered by a regression test.
- Bugs found by the runs and fixed: package.json `test` script was invalid JSON; manual Chọn crashed (`ref.current` lacked `actions`); a double tap on the dock advanced two steps (now disarmed 700 ms after each phase change); Host header overflowed at 390 px; toasts covered the reader buttons (moved to the top); a typo in built-in scenario 1.
- Screenshots: `docs/screenshots/s2/` (TV phases at 1920x1080: tv01..tv13; Host phases at 390x844: h01..h15; players p01..p05; perf and AI round trip).
- Browser: the project's own Playwright Chromium (`tools/browser.mjs`) was used for all browser runs; the in-app Browser pane was not available in this session.

## Open items (need the owner)
1. Deploy `database.rules.json` (stage 1 and stage 2 rules are in the same file): `cd tools && npx firebase login && npx firebase deploy --only database --project xu-ly-tinh-huong --config ../firebase.json`, or paste the file in Console > Realtime Database > Rules > Publish. The Firebase CLI is not signed in in the build sandbox, so this was not done here.
2. Enable GitHub Pages (main, /). The live URL answered HTTP 404 on 2026-11-11. The stage-2 work is on the branch `claude/laughing-wright-e0t6m5`; Pages serves `main`, so merge or fast-forward it into `main` (the project rule is to publish by pushing `main`).
3. Then run `node tools/rules-test.mjs` (real database, stage 1 + 2 cases) and `E2E_URL=https://harieedawwn.github.io/xu-ly-tinh-huong/ node tools/e2e.mjs --live`; tick the three `[ ]` items (two S1, one S2) in SPEC.md.

## Next (stage 3)
- Real devices (Zalo, iPhone Safari, Android Chrome), 4K/projector, reduced motion, TV sound for the last 10 s (WebAudio code exists, untested on real TVs), offline queue, accessibility pass, 42-player load test against the 360 MB/day cap, code and security review.
