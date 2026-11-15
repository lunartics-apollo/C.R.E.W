# Science & engineering model

All mission physics lives in `src/simulation/`, which is pure TypeScript and imports no Phaser or React. It is deterministic, so a given seed always gives the same mission, and every result is a language-neutral code that the UI translates.

## Units
mass kg · volume U (1U = 10 cm cube) · power W · energy Wh · data MB / Mbps · time s · angles deg.

## Mass, volume, envelope (`design.ts`)
- `mass = fixedBus(0.9 kg) + Σ component.mass`
- `volume = fixedBus(0.4 U) + Σ component.volumeU`, usable frame volume 2.7 U (game assumption)
- Over-filling converts the excess volume to a protrusion at 113.5 mm per U (340.5 mm ÷ 3, NASA App. C), so the dispenser door cannot close.
- Protrusion limit 6.5 mm (NASA §2.4 / App. C). A warning appears within 1 mm of the limit ("don't design to the limits").
- Mass limit per package (4.0 / 4.0 / 3.6 kg). A warning appears within 5% (NASA §6.4 margins).
- Centre of gravity uses a simplified 1-D stack estimate, ±7 cm (modelled on the CDS; must be verified against a real ICD).

## Budget
`committed = hardware + launch package + ground segment + testing (actual incl. retests; estimate before first test) + travel (NASA Fig. 9) + operations (5 Cr/day) + extra qualification`.
Reserve = ceiling − committed. MRR gate: reserve ≥ 10% (NASA §2.2).

## Power (`power.ts`)
- Battery step: `E' = clamp(E + (P_gen − P_load)·Δt·0.90, 0, C)` when charging. When discharging, `E' = clamp(E + (P_gen − P_load)·Δt / 0.95, 0, C)`.
- Loads by mode: nominal (all idle loads), load-shed/safe (payload standby and data radio off, ADCS at 30%).
- Eclipse battery heater: 0.8 W in shadow.
- Automatic safe mode below 20% SOC, released above 40%. Health loss below 5% SOC and on brownout (0 Wh).
- Capture energy = slew (ADCS active − idle) × slew time + (camera active − idle) × capture time + OBC.
- Downlink energy = (radio TX − idle + ADCS tracking for S/X) × transmit time.
- Builder and T3 use a reference analysis: 30 standby orbits to steady state, then one busy orbit with a capture plus an 8-minute eclipse downlink.

## Orbit (`orbit.ts`) — educational simplification, physics-based
- Circular two-body orbit with secular J2 drift: `dΩ/dt = −1.5 n J2 (Re/a)² cos i`, plus J2 corrections to the rate of the argument of latitude.
- Rotating spherical Earth (GMST), and low-precision solar position (Astronomical Almanac style).
- Cylindrical Earth shadow for eclipses.
- 10 s steps over the 10-day campaign. The scenario records:
  - eclipses;
  - Kuching and Miri contacts (elevation ≥ 10°);
  - daylight target passes per Rajang zone (Sun elevation ≥ 15°, off-nadir ≤ 40°).
- The sun-synchronous package sets RAAN from LTAN 22:30, so the descending node is at 10:30.
- Verified by tests:
  - the period matches Kepler to within 0.5%;
  - the SSO node drifts ≈ 0.98° per day;
  - ground-track latitude never exceeds the inclination;
  - Rajang is not visible on every orbit;
  - the packages differ in their contacts.

## Target access & image quality (`observations.ts`, `ops.ts`)
- Reach = ADCS max off-nadir + camera half field of view + 2° zone half-size.
- Capture slot: the earliest time in the pass after the previous capture plus slew, while the off-nadir angle ≤ reach. Off-nadir varies linearly between closest approach and the edge of the pass.
- GSD = GSD@500 km × altitude/500 ÷ cos²(off-nadir).
- Coverage = 1 if the pointing error ≤ half field of view, else half field ÷ error. A load-shed period triples the pointing error.
- **Usable** means all of the following:
  - cloud ≤ the objective's limit;
  - coverage ≥ 0.7;
  - GSD ≤ the objective's limit;
  - NIR present if required;
  - received on the ground.
- Clouds are a **seeded simulated scenario**: a diurnal baseline of 12% in the early morning rising to 45% in the late afternoon (convective build-up over Borneo, simplified), plus a seeded day-to-day term of ±0.2, a zone term of ±0.1, and a forecast error of ±0.12.

## Downlink
- `MB = rate(Mbps) × seconds ÷ 8 × efficiency`
- `efficiency = 0.8 (protocol) × spacecraft pointing × ground pointing × rain fade`, where:
  - spacecraft pointing factor = 1 if the ADCS error ≤ the radio requirement, else (requirement/error)², with a minimum of 0.05;
  - ground pointing loss = 12·(calibration error / beamwidth)² dB (standard parabolic approximation);
  - storm rain fade = UHF 1.0, S 0.8, X 0.35.
- Data is only sent inside contact windows (tested) and never exceeds stored data or capacity (tested). Partially sent files resume on the next pass.

## Verification (`verification.ts`)
T1 fit/envelope + RBF pin · T2 mass + CG · T3 battery protection (UL listing) + energy balance · T4 DITL (switches ≥ ICD inhibits, timer is not an inhibit, deploy/TX delays ≥ ICD, TX after antenna deploy) · T5 dual burn wire for deployable wings, heritage qualification, TVAC · T6 band compatibility, calibration loss ≤ 3 dB, throughput · T7 natural decay ≤ 5 years (lifetime table × drag-sail factor 0.08).
Each result stores a hash of its inputs. Changing those inputs invalidates the result (NASA §2.11 / §6.9 retest rule).

## Anomalies (condition-based)
1. **Eclipse energy deficit:** at eclipse entry, if the predicted SOC at sunrise (nominal load, heater and planned night downlinks) is below 35%. Options: stay nominal, shed load for one orbit, or command safe mode.
2. **Downlink bottleneck:** pending MB exceeds the predicted remaining contact capacity. Options: prioritise and delete unusable files, compress (needs the compression OBC, 35% size, quality ×0.9 RGB or ×0.75 NIR), book the Miri partner station (25 Cr from reserve), or carry on. At most 2 per mission.
3. **Storm over Kuching:** a labelled scenario weather event at day 4.0–4.9, triggered on the first contact in the window that has data pending.

## Outcome & score (`score.ts`)
- **Success:** usable returned ≥ 3, zones ≥ 2, and health ≥ 20%.
- **Partial:** survived with at least 1 usable dataset.
- **Failure:** otherwise.
- **Score (game-defined):** science 35 · engineering margin 25 · operations 20 · budget 10 · risk/recovery 10. A failure is capped at 40 and a partial at 75.

## Balance evidence (20 weather seeds, scripted "sensible" policy)
| Objective / build | Station | Polar | Equatorial |
|---|---|---|---|
| Land cover, HD + wheels + S-band | partial 20/20 (downlink-limited) | success 20/20 | success 16/20 |
| Detail, HD + wheels + S-band | partial | success 11/20 | 0/20 (GSD at 600 km + afternoon cloud) |
| Vegetation, MS + wheels + S-band | partial | success 17/20 | success 7/20 |
| Vegetation, MS + wheels + X-band | **success 15/20** | success 17/20 | success 7/20 |

No single build wins everywhere. The station ride needs a fast radio, the polar ride gives clear mornings but needs a drag sail and costs more, and the equatorial ride has many cloudy afternoon chances.
