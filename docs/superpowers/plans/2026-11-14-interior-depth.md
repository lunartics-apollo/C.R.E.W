# Interior depth implementation plan

**Goal:** Approved 2.5D direction: richer interiors, raised furniture, consistent light, more room-specific assets, clear routes and mission stations.
**Architecture:** Extend the existing Pillow world-art generator with a furniture renderer. Export a shared transparent sprite atlas and placement manifest, then reuse Godot's existing world Y sorting for furniture occlusion. Keep layout and collision in station_layout.json.
**Tech stack:** Existing Python/Pillow and Godot 4.7; no new dependencies.

- [x] Add an atlas/placement/occlusion regression check; observe failure.
- [x] Draw detailed furniture, room materials, contact shadows and wall lighting.
- [x] Add curated room furnishings with collision footprints, away from tasks and doors.
- [x] Export the atlas and connect Y-sorted sprites to StationScenery.
- [x] Verify all tasks remain reachable; run mission checks and inspect multiple rooms in game.

Preserve crew selection, story, HUD, current staged work and the Mess Hall meeting. Decorative surface items need no collision; new freestanding furniture uses shared layout collision.
