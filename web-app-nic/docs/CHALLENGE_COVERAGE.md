# NASA Space Apps 2026 — Space Mission Design Game: coverage map

Status key: ✅ implemented, with evidence from both the UI and tests · 🟡 partial · ⬜ planned.

| Dimension | Status | Gameplay evidence | Modules | Tests / QA evidence |
|---|---|---|---|---|
| Mission objectives | ✅ | Briefing: 3 objectives (land cover / detail / vegetation NIR) + priority zone → requirements sheet | `mission.ts`, `StoryScreens.tsx` | Browser playthrough (QA §2); `score.ts` uses the objective limits |
| Spacecraft design | ✅ | Drag/tap 3U builder, 9 subsystems, 22 parts, exploded view, undo, slots, compare | `catalog.ts`, `design.ts`, `HangarScreen.tsx`, `HangarScene.ts` | Tests 1, 2, 7; QA §2 |
| Scientific instruments | ✅ | 3 cameras with different GSD, field of view, file size, power and NIR | `catalog.ts`, `observations.ts` | Tests 11, 12, 14 |
| Launch vehicles | ✅ | 3 fictional rideshare packages with different orbits, cost, mass limit and ICD | `mission.ts`, `planning.ts`, `PlanningScreens.tsx` | "packages differ", "orbits change outcome", test 13 |
| Budget | ✅ | Hardware + launch + ground + tests (incl. retests) + travel + ops + qualification; 10% reserve gate; partner booking from reserve | `design.ts budget()`, `verification.ts` | Test 3; MRR gate |
| Power | ✅ | Sunlit generation, loads by mode, Wh battery, eclipse heater, safe mode, eclipse anomaly | `power.ts`, `ops.ts` | Tests 4, 5, 6, 7, eclipse-anomaly test |
| Mass / volume | ✅ | Live mass, volume, protrusion; overfill → door can't close; dispenser mass limit | `design.ts`, T1/T2 | Tests 1, 2, 13 |
| Communications | ✅ | UHF/S/X radios, band-matched stations, calibration mini-game, pointing and rain fade, finite passes | `design.ts link`, `ops.ts performPass` | Tests 9, 10 |
| Orbital constraints | ✅ | J2 orbit model, eclipses, contacts, daylight passes; inclination fixed after deployment (no propulsion) | `orbit.ts`, `OrbitScene.ts` | Orbit tests (Kepler period, SSO drift, latitude bound, not every orbit) |
| Risk & verification | ✅ | T1–T7 with causes and remedies, invalidation on change, qualification purchases, MRR GO/NO-GO | `verification.ts`, `ReadinessScreens.tsx` | Invalidation, DITL, burn-wire, debris and recovery tests; QA §2 |
| Mission operations | ✅ | Capture/skip with forecast, downlink queue (reorder, delete, compress), auto-downlink, 3 anomalies, first contact | `ops.ts`, `FlightScreens.tsx` | Tests 8, 15, 16, 20, anomaly tests; QA §2 |
| Mission evaluation | ✅ | Debrief: outcome from returned usable data, reasons, recommendations, score formula, dataset table, SOC/storage chart, log | `score.ts`, `DebriefScreen` | Tests 14, 16; QA §2 |

Extras: EN/BM (test 18 plus key-parity tests) · saves (test 17) · Teacher View with CSV export · optional pre/post quiz · badges.

## Planned, not playable yet
⬜ Guardians of the Rainforest · ⬜ Coastal Watch · ⬜ Signal Lost · ⬜ Design Your Own Mission · ⬜ PWA offline cache · ⬜ propulsion · ⬜ alternative CubeSat sizes · ⬜ real dated weather data.
These are not shown in the UI as playable.
