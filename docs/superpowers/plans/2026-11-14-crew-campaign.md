# Crew Campaign Implementation Plan

**Goal:** LET EXPLORE leads to a four-person meeting, full-body crew selection, and a saved character commitment lasting three distinct missions.
**Architecture:** A small Campaign resource owns save data and mission definitions. A Preflight control renders the briefing and crew selection using existing pixel sprites. World keeps the selected character, delegates specialist interactions, and records successful endings.
**Tech Stack:** Godot 4.7 / GDScript; existing artwork and pixel font; no dependencies.
**Spec:** User-approved flow in this chat: meeting → selection → three completed missions → selection unlocked. All four profiles show role, speciality, ability and contribution. Save between sessions.

## Constraints and review focus
- Preserve existing staged work and standalone world behavior.
- Count each distinct mission once; failures, replays and restarting cannot unlock early.
- Prevent Tab/number switching while committed, including after reload.
- Handle talk objectives targeting the selected character and specialist jobs without dead ends.
- Validate save data and keep briefing/selection text inside 480×270.
- The third mission uses a distinct relay deployment story on the existing station map.

## Tasks
- [x] Add failing campaign/preflight tests; confirm failure.
- [x] Add Campaign save/selection/completion logic and four crew profiles.
- [x] Add meeting scene and selection UI; connect main menu and third mission.
- [x] Enforce world commitment, teammate assistance and mission-end progression.
- [x] Run focused tests, existing world checks and project validation; visually inspect and launch updated game.

Execution: inline; surgical edits in the current workspace preserve the user's in-progress project. No branch operations or unrelated cleanup.
