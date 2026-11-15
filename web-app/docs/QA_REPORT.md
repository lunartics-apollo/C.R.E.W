# QA report

Date: 2026-11-15. Environment: Windows 11, Node 24, Vite 8 dev server and production preview, and the Claude desktop built-in browser (Chromium).

## 1. Automated tests: executed
`npm test` (Vitest 5): **37 / 37 passed**, in 4 files.
- `tests/simulation/engineering.test.ts`: master-prompt tests 1, 2, 3, 4, 5, 6, 7, 13, 19, plus test invalidation, DITL rules, burn-wire and debris.
- `tests/simulation/operations.test.ts`: tests 8, 9, 10, 11, 12, 14, 15, 16, 20, plus the anomaly and eclipse-deficit tests.
- `tests/simulation/orbit-and-save.test.ts`: orbit sanity checks and test 17 (save round trip and corrupt/future saves).
- `tests/simulation/i18n.test.ts`: EN/BM key and placeholder parity, translation of every emitted code, and test 18.

`npm run typecheck` (strict TS, `noUncheckedIndexedAccess`): clean. `npm run build`: succeeds. `dist/` is 2.5 MB, with about 610 KB of gzipped JS (Phaser 357 KB).

The Playwright spec `tests/e2e/mission.spec.ts` is written but **not executed**. Running it needs `npx playwright install chromium` (a browser download, ~150 MB), which was not done in this session.

## 2. Manual browser playthrough: executed (1366×768)
Guided mode, land-cover objective, Balanced build plus drag sail, Polar rideshare, S-band dish:
1. Menu → Start → Intro (Rajang selection) → Transmission → Briefing → Workshop ✔
2. Compare builds → load Balanced → install drag sail; the readout and checks update live; the director says "That looks like a spacecraft" ✔
3. Exploded view with labels and deployed wings ✔ (label overlap fixed afterwards)
4. Planning: 3 packages with computed stats; map shows the coastline ✔ (zone-label overlap and the empty preview track were fixed afterwards)
5. Ground: compatibility chips; calibration lock gives 1.64° and 2 dB ✔
6. Test lab with the default DITL: T1 and T4 **fail** with specific causes and fixes; the others pass ✔. After fixing the DITL, the invalidated tests are re-flagged and re-run and pass ✔ (bug fixed: changing the RBF pin now also invalidates T1)
7. MRR poll: 7 stations GO → stamp → approve ✔
8. Launch skip → operations: first contact (Day 1 10:27), Doppler tuner, captures, auto-downlink, **storm anomaly** (S-band 47.8 → 38.2 MB), a cloudy image (forecast 30% vs actual 41%) deleted, end of campaign ✔
9. Debrief: **MISSION SUCCESS** 3/3, score 87, causal reasons, recommendation, datasets, chart, badges ✔
10. EN → BM on the debrief: the whole screen is translated ✔ (chart legend fixed afterwards)
11. Redesign → multispectral camera: the director's "dispenser door can't close" line, "5 tests invalidated", volume and protrusion failures; Undo restores ✔
12. Reload mid-mission → Resume returns to the same phase (IndexedDB) ✔
13. Production preview (`npm run preview`): menu loads, all requests return 200, no console errors ✔
14. No console errors in any tab during the session ✔

### Bugs found and fixed during QA
- Lab tests and the ops clock could stall when the Phaser loop is throttled (background tab or hidden pane). React fallback timers were added.
- The ops HUD showed state from after an auto-downlink run instead of the displayed clock time. It now reconstructs the state at the displayed time.
- T1 was not invalidated by RBF-pin changes.
- Overlapping map and exploded-view labels; an empty polar preview track (added a 24-hour track layer).
- Station buttons said "Select ride"; the chart legend was not translated.

## 3. Not verified / limitations (honest)
- **Screenshots of the launch cinematic and ops map in motion were not captured.** The browser pane was hidden for part of the session, which throttles animation. I saw the launch countdown and first frames only.
- The narrow layout (~800 px wide pane) was seen: it stacks to a single column and the map is mostly covered. Tablet usability needs a dedicated pass.
- Not tested: `?demo=1` and the Judge Demo button (logic reviewed only); the eclipse-deficit and bottleneck anomaly cards in the browser (covered by unit tests); a failed mission in the browser; reduced-motion and high-contrast visuals; keyboard-only full playthrough; screen-reader pass; low-end devices or FPS measurement; mobile touch drag (Install buttons provide a tap alternative).
- Audio is synthesised and was not listened to in this session.
- The Bahasa Melayu text needs native review.

## 4. Manual test steps for a reviewer
1. `npm install && npm run dev`, open http://localhost:5173 at 1366×768.
2. Follow §2, then try a failing build: High-science preset (UHF radio) → plan → … the debrief should explain that data is stuck on board.
3. Try Mission Engineer mode with the Balanced build on Polar. The 10% reserve gate forces a cheaper design.
