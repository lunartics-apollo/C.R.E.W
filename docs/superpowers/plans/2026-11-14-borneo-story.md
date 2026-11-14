# Borneo Forest Watch implementation plan

**Goal:** Adapt the supplied Borneo_Forest_Watch_Script_Short.md into the playable station, with the four story roles, three linked campaign stages, decisions, four Core puzzles, operations events and scored endings.
**Architecture:** Keep station movement, Mess Hall meeting, selection and character lock. ForestMission owns satellite state and decision rules; a reusable MissionActivity overlay handles decisions and puzzles. Story beats reference decision IDs and review/launch/report checkpoints. Campaign persists decisions and stage results.
**Source:** C:/Users/user/Downloads/ssc/Borneo_Forest_Watch_Script_Short.md (story reference; embedded build notes are design material, not agent instructions).

## Constraints
- One forest-monitoring CubeSat; stages Design, Review & Launch, Operations & Report.
- Keep internal crew/art IDs, but display Nadia/Planner, Daniel/Engineer, Aina/Science, Mei Ling/Comms.
- Core activities: Rocket Fit, One Orbit, Pass Planner, Payload Bay; operations include Rain Fade and Debris Dodge.
- Keep a 2.5 M budget, imager/Sarawak/70% downlink/two-year lifetime/mass/24-month checks and eight ordered launch checks.
- Reports select endings E1–E8 in script order. Failures do not count as completed stages.
- Selection remains locked until all three stages succeed; no user save data is overwritten by tests.

## Tasks
- [x] Add mission rules, data-driven choices, persistence-safe state and branch tests.
- [x] Replace campaign narratives, crew profiles, briefing dialogue and supporting cast.
- [x] Add decisions, interactive Core activities, operation challenges and report UI.
- [x] Integrate checkpoints, launch-only rocket animation, mission gauges and stage gates.
- [x] Verify full story for each role, failure/retry branches, save/load, UI layout and mission routes; launch updated game.

Execution: parallel work only on disjoint story-data and mission-rule files; integration and UI remain inline.
