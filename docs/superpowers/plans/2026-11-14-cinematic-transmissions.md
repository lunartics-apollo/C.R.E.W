# Cinematic transmissions implementation plan

**Spec:** docs/prompts/borneo-forest-watch-cinematic-prompt.md, explicitly authorized by the user's “proceed”.
**Goal:** Animated on-screen story speakers deliver stage-specific interactive mission briefings and ending transmissions through a physical-looking monitor.
**Architecture:** Reuse the menu's stage gates, Preflight handover and campaign. Add a presentation-only Transmission control, a reusable TransmissionSpeaker component, JSON segments, a small settings resource and a restrained CRT shader. Original reproducible pixel-art sheets and local synthesized audio supply the media.

## Invariants
- Opening/replaying/declining a briefing never mutates campaign decisions, resets a project or advances a stage.
- Only acceptance can proceed to existing Mess Hall meeting and role selection. Keep the same gameplay spawn and lock.
- Actual ignition remains at the Review & Launch checkpoint. Ending transmissions use the existing result; no rerolls or duplicate credit.
- Aisyah, Hamdan, Jabu, Ling and Siti visibly speak. No voice recording or external imagery is implied.
- Full and reduced-motion/skip paths converge to the same handover. Essential objectives remain readable with sound/subtitles disabled.
- Settings, seen introductions and presentation audio stay separate from campaign state.

## Tasks
- [x] Add failing presentation/navigation checks.
- [x] Generate original cast expression/mouth sheets and five short audio cues; inspect assets.
- [x] Add canonical briefing segments and frame-based speaker delivery.
- [x] Build the physical monitor, intelligence visuals, activation, controls and settings.
- [x] Integrate acceptance/decline, repeat visits, stage navigation and ending handovers.
- [x] Verify input, skip/replay/cancel, save immutability, locked stages, FPS, rendered screens and story regression tests; launch the final game.

Parallel work uses disjoint art and speaker/data files. Monitor, tests and integration stay inline. Preserve all existing staged work.
