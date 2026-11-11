# Plan

| Stage | Scope | Status |
|---|---|---|
| 1 | Repo + Pages, Firebase data model and rules, design system, thin live loop on Home / Player / TV / Host | **Built and verified locally (emulator). Waiting for: rules deploy, Pages enable, live check.** |
| 2 | Full host pipeline (SPEC.md "Host features"): bank, AI export/import, showcase, voting, scoring, reveal, leaderboards, settings | Not started |
| 3 | Device hardening (Zalo, iPhone, Android, 4K), 42-player load test, offline queue, accessibility, review | Not started |

## Stage 1 evidence (2026-11-11)
- `npm test`: 36 unit tests pass.
- `node tools/with-emulator.mjs node tools/rules-test.mjs --emulator`: 174 checks pass (allowed and forbidden actions, plus the app's own payload builders).
- `node tools/with-emulator.mjs node tools/e2e.mjs`: 43 checks pass (host + TV + 3 players in separate browsers; screenshots in `docs/screenshots/` at 390x844, 1440x900, 1920x1080).
- Real database: `rules-test.mjs` not yet run (rules must be deployed by the owner first). A real anonymous sign-in against the project succeeded, and unauthenticated reads are denied (401).

## Stage 1 open items
1. Owner deploys `database.rules.json` (Console paste or firebase CLI sign-in).
2. Owner enables GitHub Pages (main, /).
3. Run `node tools/rules-test.mjs` and `E2E_URL=... node tools/e2e.mjs --live`; tick the two `[ ]` S1 items in SPEC.md.

## Next (stage 2 starting points)
- Host panels live in `js/screens/host.js`; payload builders go in `js/lib/room-ops.js` so `tools/rules-test.mjs` covers them.
- Add rule coverage first (author mapping `private/optionOf`, `public/vote`, `public/showcase`), then UI.
- Team mode voting: also write `optionOf` for the representative's teammates so they cannot vote for their own tổ's option.
