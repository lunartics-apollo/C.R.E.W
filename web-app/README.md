# BORNEO SENTINEL — From Sarawak to Space

A browser-first STEM game for Sarawak secondary-school students (≈13–17). You join a **fictional** Sarawak Space Academy, design a **3U CubeSat** to observe the **Rajang River**, prove it is ready to fly, choose a rideshare orbit and ground station, launch it, operate it for a simulated 10-day campaign, and learn from a causal debrief.

`LOCAL PROBLEM → OBJECTIVE → BUILD → TEST → REDESIGN → LAUNCH → OPERATE → RESPOND → DOWNLINK → DEBRIEF → IMPROVE`

No install, no login and no backend. Everything runs offline in the browser. English and Bahasa Melayu are both included.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 37 Vitest science/state tests
npm run build      # type-check + production bundle in dist/
npm run preview    # serve dist/ at http://localhost:4173
```

The Judge Demo button on the menu, or `/?demo=1` on a first visit, starts from a pre-built balanced CubeSat in the test lab. All gameplay after that is real.

## What is in the vertical slice

| Chapter | What you do |
|---|---|
| 01 Our Home: Sarawak | Find the Rajang on a real-coastline map (Natural Earth) |
| 02 Transmission | Meet the original director, choose **Guided Cadet** or **Mission Engineer** |
| 03 Briefing | Choose one of 3 science objectives and a priority zone → measurable requirements |
| 04–05 Workshop | Drag modules onto a pixel-art 3U cut-away. Live mass/volume/power/battery/storage/link/budget, exploded view, undo, 3 save slots, compare builds, director reacts to trade-offs |
| 06 Launch planning | 3 fictional rideshares compared with numbers from the real orbit model (passes, local time, cloud, contacts, lifetime, mass limit, ICD rules) |
| 07 Ground station | 3 fictional stations (UHF/S/X) + Sun-noise antenna calibration mini-game |
| 08 Test lab | T1–T7 animated tests (fit, mass, battery, DITL, vibe/TVAC, comms, debris). Hardware changes invalidate tests |
| 08b Readiness review | 7-station GO/NO-GO poll, earned not cosmetic |
| 09 Launch | Skippable pixel cinematic with your actual deployables |
| 10–13 Operations | Animated 2D Earth + ground track + terminator; first-contact Doppler tuner; capture/downlink decisions; eclipse deficit, downlink bottleneck and Kuching storm anomalies |
| 14 Debrief | Success/partial/failure from returned usable data; reasons, recommendations, score breakdown, datasets, battery/storage chart, retry paths |

Also included: Settings (language, SFX and music volume, mute, reduced motion, high contrast, instant text), How to Play, Science & Sources, Credits, Mission Archive, Teacher View (local CSV export and print), an optional pre/post quiz, badges, and local saves (IndexedDB with a localStorage fallback).

## Key files

| Area | Path |
|---|---|
| Science model (pure TS, no Phaser/React) | `src/simulation/` — `orbit.ts`, `power.ts`, `design.ts`, `verification.ts`, `ops.ts`, `observations.ts`, `score.ts`, `planning.ts` |
| Component catalog / packages / stations | `src/simulation/catalog.ts`, `src/simulation/mission.ts` |
| Source register | `src/simulation/sources.ts` |
| State (single source of truth) | `src/state/store.ts`, save schema `src/state/saveSchema.ts` |
| Phaser scenes | `src/game/scenes/` (Sky, Hangar, Launch, Orbit) |
| React screens | `src/ui/screens/` |
| Localization | `src/i18n/en/*`, `src/i18n/ms/*` |
| Director script | `src/narrative/script.ts` (lines in `src/i18n/*/story.ts`) |
| Design tokens | `src/styles/app.css` |
| Tests | `tests/simulation/*.test.ts`, `tests/e2e/mission.spec.ts` |

## Honesty notes

- The academy, launch packages, ground stations and all component prices and ratings are **fictional** (`GAME_ASSUMPTION`).
- NASA CubeSat 101 (2017) is used for **process** principles: dimensions, dispensers, reserves, testing, DITL, MRR and debris. It is cited by section and page in the game and in `docs/ASSUMPTIONS_AND_SOURCES.md`. It is not cited for wattages or prices.
- The game uses a simplified physics model. It is **not** an accredited NASA simulator.
- The Bahasa Melayu text is a draft and needs native-speaker review.
- **Deployment has not been performed.** See `docs/DEPLOYMENT.md`.

See `docs/` for the design document, science model, challenge coverage, QA report and a 2–3 minute demo script.
