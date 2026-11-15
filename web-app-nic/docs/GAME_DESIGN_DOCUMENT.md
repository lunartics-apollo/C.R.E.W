# Game design document (includes the storyboard)

## Pillars
1. **Causality over chance:** every outcome traces back to a design, orbit, operations or weather-scenario cause, and that cause is shown to the player.
2. **Fail forward:** a failed test or mission explains why, offers a fix, and keeps the player's work.
3. **Local meaning:** the Rajang, Kuching and Sarawak's cloudy afternoons drive the science problem.
4. **A console you can touch:** angular console buttons, LEDs, pixel art, synthesised sounds and a reactive director.

## Core loop
Define → Build → Plan orbit and ground → Test → Review → Launch → Operate (capture, downlink, respond) → Debrief → Redesign.

## Storyboard (as implemented)
| # | Scene | Player input | Consequence |
|---|---|---|---|
| 00 | Menu | Start / Resume / Demo / settings / sources / teacher view | Runs without login; local save |
| 01 | Our Home: Sarawak | Click the Rajang (or the keyboard button) | Zones appear; the objective is framed |
| 02 | Transmission | Director dialogue (skippable); Guided vs Engineer | Budget 1000 / 900 Cr, hint level |
| 03 | Briefing | Objective + priority zone | Requirements sheet (count, zones, cloud, GSD, NIR) |
| 04 | Workshop | Drag or tap parts; exploded view; compare; slots; undo | Live readout; findings with fixes; director reactions |
| 05 | Trade-off trial | The multispectral camera tempts the player; the power or volume deficit appears | The player fixes it by choosing parts, not by answering a quiz |
| 06 | Launch planning | Pick one of 3 rides | Passes, local time, cloud, contacts, lifetime and mass fit all change |
| 07 | Ground station | Pick a station; calibrate with Sun noise | Band compatibility; pointing loss carried into operations |
| 08 | Test lab | Run T1–T7; set DITL timers; buy qualification | Real pass/fail; invalidation on change |
| 08b | MRR | Readiness poll | GO only if every critical gate passes |
| 09 | Launch | Watch or skip | Your deployables deploy |
| 10 | First contact | Doppler tuner; read telemetry | Commissioning; captures unlock |
| 11 | Observing | Capture or skip with forecast, energy, storage, GSD and coverage | Observation records with real quality |
| 12 | Anomalies | Eclipse deficit / bottleneck / storm | Options change energy, data and outcome |
| 13 | Downlink | Queue order, delete, compress, auto | MB moved within finite windows |
| 14 | Debrief | Inspect results; retry three ways; quiz | Outcome from returned usable data |

## Designed trade-offs
- Big camera → more science per image, but more power, volume, storage and downlink time, and a need for better pointing.
- Reaction wheels → aim up to 30° off-nadir (more passes, sharp coverage), but a 1.6 W standby cost.
- Deployable wings → power, but they need dual burn wires (T5) and add protrusion.
- X-band → fast downlink, but 12 W TX, ≤1.5° pointing, an expensive station, rain fade, and tight calibration.
- Orbits → morning SSO (clear, but expensive and needs a sail) vs ISS-style (cheap, short passes) vs equatorial (many cloudy afternoon chances; 3.6 kg mass limit).
- Budget → retests and reserve purchases eat the 10% reserve that the MRR requires.

## Modes
Guided Cadet shows remedies for every finding and has the 1000 Cr budget. Mission Engineer shows remedies only for failures and has a 900 Cr budget. The physics is the same in both.

## Accessibility
- Keyboard: every control is a button; focus rings; Space advances dialogue; M toggles mute.
- Reduced motion and high contrast are available.
- Status is never shown by colour alone: icons and text always accompany it.
- Audio starts only after a user gesture.
- The Install button is a tap alternative to dragging.
