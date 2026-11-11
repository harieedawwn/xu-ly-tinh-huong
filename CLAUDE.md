# Xử lý tình huống - project notes

Classroom web game (Player phone / TV / Host). Static site on GitHub Pages + Firebase Realtime DB (anonymous auth). Read SPEC.md first.
UI text is Vietnamese with diacritics; code and docs are English. The role is "Host", never "Quản trò".

## Run, test, deploy
- Serve: `node tools/serve.mjs` -> http://127.0.0.1:5173/ (`.claude/launch.json` has it). Add `?emu=1` to use local emulators.
- Unit tests: `npm test` (node --test, tools/test/*.test.mjs).
- Rules + e2e on emulators: `node tools/with-emulator.mjs node tools/rules-test.mjs --emulator`, `... node tools/e2e.mjs`.
- Stage 2: `... e2e-s2.mjs`, `... perf-s2.mjs` (both under with-emulator), `node tools/ai-roundtrip.mjs [--verify]`. Screens: `js/screens/host/*`.
- Real DB rules test: `node tools/rules-test.mjs`. Live e2e: `E2E_URL=https://harieedawwn.github.io/xu-ly-tinh-huong/ node tools/e2e.mjs --live`.
- Rules: edit `tools/build-rules.mjs`, run `node tools/build-rules.mjs` (never hand-edit database.rules.json). Deploy: `cd tools && npx firebase deploy --only database --project xu-ly-tinh-huong --config ../firebase.json`, or paste the file in Console.
- Publish = commit + push to `main` (the owner's rule: no branches, git only to publish). Pages serves root.
- Tooling lives in /tools (own package.json, node_modules gitignored). Run `cd tools && npm i` once.

## Data paths (details in SPEC.md)
`/secrets/{code}/pin` (unreadable), `/rooms/{code}/{hostUids,hostClaims,claimTries,public,private,players,presence,reps,answers/{round}/{uid},submitted/{round}/{uid},votes/{round}/{uid},banned}`.

## Stage 2 architecture
- Phase changes ONLY through `js/lib/phases.js` `transition()` run by `lib/tx.js` (transaction on `public`); screens never write `public/phase`. Dock buttons are disarmed 700 ms after a phase change.
- Settings ranges live in `js/lib/settings.js` (SETTING_SPECS) and feed the rules generator. New write = payload in `room-ops.js` + rule in `build-rules.mjs` + case in `rules-test.mjs`.
- `ctx.ref.current` (host/data.js) is the latest data for async actions; never read stale props in actions. Rows use `memo`; pass primitives.
- Players never read `private/*`; names reach phones/TV only through `public/reveal`.

## Gotchas
- RTDB rules have no `newRoot`; use `newData.parent()`. `\s` is not valid in rules regex. Rule `.write` at a parent cascades to children.
- Every write is a payload from `js/lib/room-ops.js` (pure) so rules-test exercises the same shapes as the app.
- The SDK fires optimistic local events: a denied write briefly looks successful. Do not gate UI on a just-written value (see `claiming` in host.js).
- Never create a second anonymous user: use `ensureUser()` (waits `authStateReady`). Auth limit is 100 new accounts/hour/IP.
- Be Vietnam Pro has no `tnum`: use `Tab`/`.tab` fixed-width cells for timers, scores, codes.
- Student text: render as text nodes only. No innerHTML anywhere.
- Spark download cap is 360 MB/day: keep `public` small; players must not listen to roster-wide big paths.
- Sandbox: Node and Java need proxy env vars stripped for 127.0.0.1 (with-emulator.mjs does it). `pkill -f` patterns can match your own shell.
- Timers: all instants are server ms (`.info/serverTimeOffset`); never use `Date.now()` for `endsAt`.
