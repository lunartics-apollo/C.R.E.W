# Assumptions & sources

## Source material actually inspected
`docs/references/nasa_csli_cubesat_101_508.pdf`, a copy of the user-supplied PDF (96 pages). Its text was extracted and these sections were read: §1.1–1.3, §2.1–2.4, §2.10–2.16, §4.1–4.6, §5 (opening), §6.1–6.9, App. C.6. In this document, PDF page = printed page + 8.

| NASA CubeSat 101 location | Principle used | Where in the game |
|---|---|---|
| §1.1, p.4 (Fig. 2) | 1U = 10 cm cube; 3U ≈ 10 × 10 × 34 cm | Chassis, T1, concept card |
| §1.2–1.2.1, pp.4–5 | Dispenser is the CubeSat↔rocket interface (P-POD) | T1 animation, launch dispenser |
| §1.3, pp.6–8 | Rideshare: rocket must already go to a useful orbit | Launch planning note |
| §2.1, p.11 | Clear goals, flexible launch needs | Briefing |
| §2.2, pp.11–14 | Costs beyond hardware (testing, ground station, travel); reserves ≥ 10% | Budget model, MRR reserve gate |
| §2.3, pp.14–15 | Merit and feasibility | Design checks / science-feasibility advisory gate |
| §2.4, p.16 | Don't design to envelope limits; 6.5 mm protrusions; double burn wire; heritage parts; UL batteries | Protrusion warnings, T5, T3, qualification purchases |
| §2.4, p.17 | ADCS definition | Concept card, coverage model |
| §2.10, pp.22–23 | Radio + antenna; test early; calibrate pointing with Sun/Moon | Ground station screen, Sun-noise mini-game, T6 |
| §2.11, pp.23–25 | Verification testing; changes after testing need retest | Test invalidation by input hash |
| §2.12, p.25 | Mission Readiness Review | MRR GO/NO-GO |
| §2.13–2.14, pp.26–28 | Integration into dispenser, then onto the rocket | Launch flow |
| §2.15, p.28 | CubeSats don't control the launch date | Launch copy |
| §2.16, pp.29–30 | TLEs, first contact | First contact |
| §3.5, p.38 | ISS deployment mission model | "Station Deploy" package flavour |
| §4.1–4.4, pp.39–41 | Mission ICD is the rulebook (from LSP-REQ-317.01, CDS, dispenser specs) | Package-specific ICD rules |
| §4.5, p.41 | U.S. FCC/NOAA rules (U.S. only) | Sources disclaimer: **not** Malaysian law |
| §6.1, pp.54–55 | Orbital debris assessment; low-melting-point materials | T7 |
| §6.4, p.56 | Mass, CG, margins | T2 |
| §6.5, p.57 | Battery protection | T3 |
| §6.6, pp.57–58 | Dimensional checks before/after testing | T1 |
| §6.7, p.58 | RBF pin, separation switches; **a timer is not an independent inhibit** | T4, DITL panel |
| §6.9.1, pp.59–60 | DITL: timers, inhibits, first transmission | T4 |
| §6.9.2, pp.60–61 | Vibration required for all launches; no changes after | T5 |
| §6.9.3, pp.62–63 | TVAC bakeout / outgassing | T5 |
| App. C.6, p.82 | Sample 3U checklist: < 4.00 kg, 100 ± 0.1 mm, 340.5 ± 0.3 mm, ≤ 6.5 mm | Default mass limit, dimensions (a sample, not an official template) |

CubeSat 101 is a 2017 process handbook. It does **not** supply component wattages, prices, masses or camera resolutions, and the game does not claim it does.

## Other references (general knowledge; not fetched during this build)
- Two-body orbits and secular J2 node drift (standard astrodynamics texts, e.g. Vallado).
- Low-precision solar coordinates (Astronomical Almanac / USNO approximation).
- Parabolic antenna pointing loss ≈ 12 (θ/θ3dB)² dB (link-budget textbooks).
- Natural Earth 1:50m / 1:110m vector data, public domain, through `world-atlas@2` (npm).
- NASA Visible Earth "Sarawak's Rajang River Delta" is linked as reference imagery. It is **not bundled** because downloading it was not authorised in this session.

## Game assumptions (fictional or simplified; check before reuse)
- Sarawak Space Academy, Director Jabu, every launch package, ground station and price.
- The component catalog (`src/simulation/catalog.ts`). Magnitudes are realistic, but these are not product ratings.
- Fixed bus: 0.9 kg, 0.4 U, 0.6 W. Usable frame volume: 2.7 U.
- Package mass limits (4.0 / 4.0 / 3.6 kg) and ICD timer and inhibit rules. These are fictional per package, not universal. The 45-minute value is not claimed as universal.
- CG tolerance ±7 cm, modelled on the CubeSat Design Specification. Needs verification.
- Lifetime table (400 km ≈ 1 yr … 600 km ≈ 20 yr) and drag-sail factor 0.08. Order of magnitude only.
- Academy debris rule: decay within 5 years. This is inspired by current international practice and is **not** legal advice for Malaysia.
- Cloud model: a seeded simulated scenario with a morning-clear, afternoon-cloudy pattern. It should be checked against Borneo climatology before any real use.
- Storm event: a scripted weather event over Kuching at days 4.0–4.9, labelled as a scenario.
- Score weights are game-defined, not official NASA or Space Apps weights.

## Missing or limited material
- No user art or audio existed in the folder. All art is procedural pixel art made in code, and all sound is synthesised with Web Audio.
- No reviewed Iban translation. The only Iban phrase is the greeting "Selamat datai", taken from the master prompt.
- The Bahasa Melayu translation is a draft by the developer and needs native-speaker review.
