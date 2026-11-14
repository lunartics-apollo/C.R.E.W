# C.R.E.W — BORNEO FOREST WATCH
## Cinematic Interactive Mission Briefing and On-Screen Character System

### YOUR ROLE

Act as an experienced Godot 4 game developer with skills in pixel art, character animation, cinematic direction, interface design, audio, and gameplay systems.

Design, implement, test, and refine a working interactive mission briefing system for **C.R.E.W: Borneo Forest Watch**.

Use **Borneo_Forest_Watch_Script_Short.md** as the source for the story, characters, mission requirements, dialogue, events, and endings. Use this prompt to guide their presentation and integration into the existing game.

**The characters must visibly appear and talk on the communication screen. Do not replace them with text-only briefings, static slides, or a motionless portrait beside subtitles.**

This must be a functioning Godot implementation, not a screenshot mockup.

---

# 1. STORY AND CREATIVE DIRECTION

## The mission

Four young engineers have a small budget and two years to prepare a CubeSat that will watch Sarawak's rainforest from space. The satellite is intended to operate for two years in orbit.

Keep the tone **warm, hopeful, cooperative, and occasionally funny**. Mistakes create opportunities to learn. Nobody is blamed.

The experience should feel like receiving a memorable mission transmission from a real space-agency team: an incoming signal, a physical monitor activating, an expressive person appearing, coordinated mission visuals, and a clear invitation to begin work.

Create an original presentation. Do not copy existing television characters, dialogue, artwork, or interface designs.

## Story guardrails

- Keep the mission about **one forest-monitoring CubeSat**, rather than unrelated Moon or deep-space missions.
- Keep the current three-stage campaign: **Design → Review & Launch → Operations & Report**.
- Preserve the existing Mess Hall meeting, character selection, and gameplay starting beside the Mess Hall table.
- Preserve the selected-character lock until the three stages are successfully completed. Other specialists can help without changing the player character.
- Rocket ignition and liftoff belong to the actual launch event in **Review & Launch**. Accepting a Design or Operations briefing must not launch another rocket.
- Preserve existing mission decisions, puzzles, saved progress, scoring, and failure outcomes.
- Treat the script's numbers as draft gameplay values. Distinguish fictional announcements and illustrated imagery from verified facts or live satellite data.

---

# 2. KEEP THE STORY'S PEOPLE ON SCREEN

Use the script's existing cast. **Do not introduce Commander Atlas as a replacement for Director Aisyah.**

| Character | Function | Performance direction |
|---|---|---|
| **Director Aisyah** | Main mission briefing host and Mission Control lead | Calm, kind, confident; a little dry humor |
| **Minister Hamdan** | Opening announcement and ending addresses | Short, hopeful, encouraging |
| **Chief Jabu** | Engineering and assembly guidance | Practical, direct, reassuring |
| **Operator Ling** | Ground-station communications and operational alerts | Quick, alert, attentive to weather |
| **Dr. Siti** | Forest imaging and science guidance | Curious, thoughtful, excited by discovery |

The playable crew remains:

- **Nadia — Planner:** launch, orbit, budget, schedule, and priorities.
- **Daniel — Engineer:** spacecraft structure, power, battery, propulsion, and mass.
- **Mei Ling — Comms:** radios, ground stations, passes, and data return.
- **Aina — Science:** imager, instruments, imaging modes, and cloud-aware observation plans.

Use Aisyah as the principal monitor host. Introduce the other supporting characters through scheduled video appearances, relevant handovers, operational calls, and ending transmissions.

The four crew members must also visibly participate in the existing table meeting. Show who is speaking through their character animation, facing direction, subtle gestures, and speaker identification.

## Essential performance requirement

When somebody speaks through the monitor:

- Their original pixel-art character is visible inside the video feed.
- Their mouth changes shape as the line is delivered.
- They blink and make small, purposeful head or posture movements.
- Their expression matches the dialogue.
- Their name and role are readable.
- Subtitles accompany the performance.
- Mission diagrams can appear alongside the person, or the feed can move into a smaller picture-in-picture window.

Mission graphics must support the speaker rather than consistently replacing the person with a full-screen text slide.

---

# 3. AUDIT AND INTEGRATE WITH THE EXISTING GAME

Before implementation:

1. Inspect the current Godot project and its local instructions.
2. Locate the main menu, **LET EXPLORE** button, stage selection, Mess Hall meeting, character selection, and mission transitions.
3. Review the campaign save format, stage locks, decision system, launch resolution, reports, and retry behavior.
4. Inventory existing fonts, crew sprites, station artwork, sound effects, shaders, and animation helpers.
5. Reuse working components before adding new ones.

Preserve the navy, teal, sage, and warm amber palette, crisp pixel-art identity, and existing 2.5D station interiors.

Recommended flow:

**Select an available stage → Incoming transmission → Animated on-screen briefing → Review mission intelligence → Accept → Existing Mess Hall meeting → Character selection or locked-role confirmation → Gameplay at the Mess Hall table.**

For later stages or returning players, provide a short stage-specific update and fast access to objectives. Do not force the complete announcement and crew introduction on every return.

Declining a transmission returns to stage selection without resetting a project, changing the selected role, or advancing the story. A clearly labelled **New Project** action must remain separate from simply opening or declining a briefing.

---

# 4. THE COMMUNICATION TERMINAL

Create a distinctive physical monitor that belongs in C.R.E.W's station.

Combine retro pixel-art hardware with restrained mission-control graphics:

- A custom stepped or chamfered bezel with visible thickness.
- Recessed screen glass, vents, fasteners, and small hardware controls.
- Animated communication indicators and status lamps.
- Mission title, stage number, speaker identity, and channel status.
- Signal-strength bars and a readable communication waveform.
- Secure-link establishment and authorization indicators.
- Subtle procedural CRT scanlines and brief acquisition static.
- Gentle screen illumination on nearby equipment.
- Coordinated mission diagrams, maps, and equipment callouts.

Keep text sharp and separate from aggressive distortion. Avoid excessive bloom, constant glitches, or visual noise over subtitles.

Do not use generic default Godot panels and large rounded buttons as the final visual treatment. Make the monitor feel like purposeful spacecraft equipment while retaining clear interaction targets and focus states.

---

# 5. CINEMATIC ACTIVATION

Implement a short, directed sequence with explicit, interruptible states.

## A. Incoming transmission — approximately 1–2 seconds

- A restrained notification appears.
- The communication indicator flashes.
- A short electronic alert plays.
- A nearby light or monitor glow responds.
- The player can open the transmission immediately.

## B. Monitor power-on — approximately 1–2 seconds

- The view settles toward the terminal.
- A horizontal light expands across the screen.
- Brief static resolves into a signal-acquisition graphic.
- The channel connects.

## C. Speaker reveal — approximately 1–2 seconds

- The appropriate character appears through a short interference effect.
- The image resolves into the final pixel-art feed.
- The person blinks or adjusts posture.
- Telemetry stabilizes, and the first line begins.

Use deliberate easing and timing. Every phase must respond to skip or navigation input without leaving controls disabled, audio looping, or the camera stranded.

Reduced-motion mode must use quick fades and immediate framing instead of zooms, shaking, or distortion. Keep essential information available immediately.

---

# 6. ORIGINAL CHARACTER ART AND ANIMATION

Create original pixel-art appearances for the supporting cast that fit the existing crew and station artwork.

Aisyah should have an identifiable silhouette, expressive eyes and eyebrows, and a recognizable C.R.E.W uniform. Give the other speakers distinct silhouettes and relevant clothing or equipment.

Do not deliver placeholder rectangles or a generic geometric face as the finished character art.

Provide reusable expression and animation support for:

**IDLE · BLINK · TALK · SMILE · SERIOUS · SURPRISED · THINKING · WARNING · SIGN_OFF**

Implement mouth-shape frames, blinking, small head movements, expression changes, and occasional character-specific gestures. Keep pixel sizes and outlines consistent between frames.

Use frame-based sprites and sensible transitions. If optional mouth cues or phoneme timings exist, support them. Otherwise, use subtitle timing and punctuation to drive a convincing talking animation without claiming accurate voice lip-sync.

Use available free or open-source tools. If appropriate asset-generation tools are connected, inspect their capabilities and use them honestly. Otherwise, produce reproducible assets through the project's existing Godot-compatible art workflow.

Do not require paid APIs or introduce unnecessary dependencies.

---

# 7. DATA-DRIVEN SPEECH AND SUBTITLES

Support reusable dialogue segments containing:

- Stable segment ID and speaker ID.
- Dialogue text.
- Expression and gesture cues.
- Text speed or segment timing.
- Optional voice clip and optional mouth timings.
- Mission-intelligence visual cues.
- Optional relevant response choices.

Required behavior:

- Speakers animate while delivering their lines and pause naturally at punctuation.
- Subtitles can reveal progressively or display immediately.
- Advance input first completes the current line, then advances to the next segment.
- The player can skip the performance and still review every essential objective.
- Replay restarts the briefing presentation without repeating decisions, rerolling hazards, or changing campaign progress.
- Stopping or changing a segment cancels its previous audio and animation callbacks.
- Recorded voice clips can be added later without rewriting the dialogue flow.

If voice recordings are unavailable, use restrained communication sounds or character speech tones. Clearly distinguish these effects from recorded spoken dialogue. Avoid an irritating sound for every letter.

---

# 8. BRIEFINGS THAT MATCH BORNEO FOREST WATCH

Use the manuscript's dialogue wherever appropriate. Keep new bridging lines short and faithful to each character's voice.

## Opening announcement — Minister Hamdan

Present Hamdan visibly speaking through the screen. Retain the announcement's essential message:

> Our forests are our future.
> A CubeSat. Shoebox size. It will watch our forests from space.
> We have two years and a small budget. We need a team.
> Not astronauts. Planners. Engineers. You.

Use the manuscript for the complete announcement. Preserve its fictional context; do not invent additional government commitments.

Show the hornbill motif near the opening. Make the announcement skippable and avoid replaying it automatically after it has been completed.

## Stage 1 — Design

**Primary speaker: Director Aisyah.**

Preserve the briefing's core rules:

> Welcome. Two years. 2.5 million.
> One: talk to each other. Two: all green before launch.
> Three: every choice costs something. Four: mistakes teach us.

Reveal the mission lifecycle strip:

**Define → Design → Review → Launch → Operate → Report**

Communicate the requirements clearly:

- Forest imager on board.
- Coverage of Sarawak.
- At least 70% of data returned.
- Two years of operating life.
- Budget within 2.5 M.
- Spacecraft mass within its limit.
- Readiness within 24 months.

Use brief on-screen handovers from Jabu, Ling, and Siti for engineering, communications, and science. Their appearances must support the existing department decisions and Core puzzles rather than adding duplicate tutorials.

## Stage 2 — Review & Launch

**Primary speaker: Director Aisyah, with department confirmations.**

Focus on integration: power versus science, mass versus communications, orbit versus science, budget, and data production versus downlink capacity.

Use:

> Now it all has to fit together.
> No wrong answer. Just a different mission.

Show the actual saved design and its live requirement status. Explain the Go/Hold choice and the eight ordered checks:

**Power → Battery → Antenna → Instruments → Mass → Orbit → Budget → Schedule**

Accepting this briefing starts the review stage. It must not bypass its decisions or launch checklist. The rocket launches only when the actual launch checkpoint authorizes it.

A failed review returns useful revision guidance. Launch failure uses the manuscript's non-blaming response and preserves a clear route to a new attempt.

## Stage 3 — Operations & Report

**Primary speakers: Operator Ling and Director Aisyah, with Jabu and Siti as relevant.**

Open with signal acquisition and first light over Sarawak. Explain that keeping the spacecraft alive and returning useful forest data is now the job.

Coordinate the operational calls with the manuscript's events:

- Q2: heavy cloud — Aina / science.
- Q3: station outage — Mei Ling / communications.
- Q4: rain at the dish — Mei Ling / Rain Fade.
- Q5: long eclipse — Daniel / power triage.
- Q6: instrument glitch — Aina / reset sequence.
- Q7: debris warning — Daniel / Debris Dodge.
- Q8: battery heating — Daniel / cooling and load management.

The briefings should make the cause, risk, responsible department, and next action understandable. Do not create unrelated orbital-enemy or secret-agent combat missions.

---

# 9. MISSION INTELLIGENCE VISUALS

Synchronize the talking character with relevant visual material:

- A Sarawak/Borneo mission map and coverage markers.
- CubeSat bus and instrument diagrams.
- Solar-panel and battery illustrations.
- Orbit and launch-option diagrams.
- Budget reserve and mass-margin indicators.
- Kuching ground-station and downlink diagrams.
- Pass timelines, data tanks, cloud warnings, and rain-fade indicators.
- A two-year operations calendar.
- Actual saved requirements, puzzle tiers, and report results.

Label simplified diagrams as schematics where necessary. Label project-created forest imagery as an illustration or simulation. Do not present invented coordinates, telemetry, or forest pictures as real observations.

Use the main video feed, split-screen layouts, and picture-in-picture handovers. When a map takes prominence, keep the speaker visible where the composition allows it.

Animate specific points of interest: a coverage region, a power margin, a missed downlink pass. Avoid animating everything at once.

---

# 10. THE MESS HALL AND CHARACTER HANDOVER

Preserve the current physical Mess Hall table and the four crew members gathered around it.

The communication briefing and table meeting should feel like connected parts of one mission preparation sequence, rather than two unrelated introductions.

Keep the crew's memorable introductions:

> **Nadia:** I make sure we don't run out of money before we run out of sky.
> **Daniel:** I make sure it doesn't melt, freeze or fall apart.
> **Mei Ling:** I make sure the data gets home.
> **Aina:** I make sure it's worth it.

Use these introductions when first meeting the crew. Later meetings should discuss the current stage instead of repeating every introduction.

Keep the existing character-selection layout, including each character's full body, role, speciality, ability, and contribution.

If the role is already locked, clearly show the current character and stage progress. Reviewing another profile must not change the selected character. Confirmation continues with the locked role.

After selection or confirmation, begin gameplay beside the same Mess Hall table and resume the appropriate saved story step.

---

# 11. PLAYER INTERACTIONS

Support mouse and keyboard input for:

1. Selecting an available campaign stage.
2. Opening an incoming transmission.
3. Watching the animated speaker.
4. Advancing or skipping dialogue.
5. Reviewing objectives and mission requirements immediately.
6. Switching between relevant intelligence views.
7. Replaying the presentation.
8. Accepting or declining the mission.
9. Returning to stage selection.
10. Continuing to the existing crew meeting and character confirmation.

Show clear focus, hover, pressed, and disabled states. Keep controls usable at the native resolution and when scaled.

Enter or Space must activate the focused control correctly. A navigation key must never accidentally accept a mission or commit a character choice.

Unavailable stages must explain their prerequisite. Returning to the menu must not strand a project whose launch result has already been saved but whose stage-completion presentation has not finished.

---

# 12. ACCEPTANCE AND TRANSITIONS

When the player accepts:

1. The on-screen speaker acknowledges the decision.
2. Mission authorization indicators respond.
3. A short confirmation animation plays.
4. The speaker signs off.
5. The monitor powers down or settles into a standby state.
6. The view returns to the existing station preparation flow.
7. The crew meeting and character handover lead into the selected stage.

For **Design**, this leads to department work.

For **Review & Launch**, this leads to review and the Go/Hold/checklist sequence. Camera movement, launchpad activation, ignition, rocket ascent, and the launch hornbill occur at the real launch checkpoint.

For **Operations & Report**, this leads to the already-deployed satellite's operations. Do not replay ignition or create a second satellite.

Keep transitions short, interruptible, and continuous. Reduced-motion and skip paths must reach the same correct gameplay state as the complete cinematic.

---

# 13. REPORTS AND ENDING TRANSMISSIONS

Use the existing mission results, rather than a decorative success screen.

Hamdan should visibly speak on the monitor for the appropriate ending. Aisyah can provide practical follow-up guidance.

Preserve endings **E1–E8**, their lessons, and the script's evaluation order:

**Review blocked → Launch failure → Power failure → Debris loss → Short life → Score bands.**

The report must retain:

- Grade, score, and headline.
- Requirement checks with actual numbers.
- Role decisions and puzzle tiers.
- Plain-language explanations of what happened.
- An appropriately labelled forest preview or sourced image.
- One useful next-attempt tip.

Use the ending's correct emotional tone. Successful endings may show the crew watching a night pass. Compromised missions focus on one fix. Launch or review failures lead to a fresh plan without blame.

Show the closing hornbill and preserve:

> Sarawak's sky is waiting.

Ending replay must not reroll a launch or debris outcome, duplicate completion credit, or unlock a role early.

---

# 14. MOTION, SOUND, AND ACCESSIBILITY

Use directed motion: staggered readouts, brief signal acquisition, masked screen reveals, expression changes, restrained camera movement, and reactive lighting.

Prefer a small number of well-timed effects to constant visual activity. Avoid motion blur that smears pixel art or makes text difficult to read.

Provide:

- Skip animation and skip dialogue.
- Replay controls.
- Dialogue-speed control.
- Subtitle visibility settings.
- Audio-volume and mute controls.
- Reduced-motion behavior.
- Keyboard navigation and visible focus.

Essential objectives, warnings, and requirements must remain available as readable text even when subtitles are hidden, sound is muted, or the cinematic is skipped.

Use short, restrained alerts, connection tones, confirmation sounds, and ambient communication audio. Stop or fade them when the player leaves the screen. Never leave a looping alert behind after skipping or declining.

---

# 15. TECHNICAL APPROACH

Use **Godot 4 and GDScript** and follow the existing project architecture.

Appropriate building blocks include:

- Control nodes for monitor composition and interaction.
- AnimatedSprite2D or SpriteFrames for talking characters and expressions.
- AnimationPlayer for fixed cinematic choreography.
- Tweens for short responsive transitions.
- Camera2D for actual world-camera moves.
- CanvasItem shaders for restrained screen effects.
- AudioStreamPlayer for alerts, communication sounds, and optional voice clips.
- JSON or Resources for speaker segments and mission-intelligence cues.
- Signals for acceptance, cancellation, segment completion, and gameplay handover.

Separate responsibilities where useful, but avoid a large framework or unnecessary abstractions. Reuse the current dialogue, settings, art helpers, campaign, and transition systems when they fit.

Use a clear sequence state machine so skipping, replaying, declining, changing stages, and accepting cannot leave stale callbacks running.

Opening and replaying a briefing should be presentation-only. Commit mission choices and progress only through the existing gameplay and save pathways.

---

# 16. PERFORMANCE AND QUALITY CHECKS

Target stable **60 FPS** on the existing project settings. Keep shader cost, transparency layers, sprite counts, and audio work modest.

Verify the rendered game rather than relying on code inspection alone.

Test:

- Every on-screen speaker visibly animates while talking.
- Mouth movement stops or changes at pauses and line completion.
- Expressions, subtitles, and visual cues agree.
- Monitor acquisition and shutdown work with normal and reduced motion.
- Text remains crisp and readable at the native 480 × 270 resolution and supported scales.
- Mouse and keyboard can complete every interaction.
- Skip, replay, decline, back, and accept work during each sequence phase.
- Audio stops correctly when a screen is interrupted.
- Locked stages and locked characters remain protected.
- Saved progress resumes correctly, including interruption immediately after launch resolution.
- The three-stage story launches one CubeSat at the correct checkpoint.
- Reports use actual mission state and all supported endings remain reachable.

Capture and inspect important frames: incoming notification, monitor power-on, Aisyah speaking, an intelligence handover, the crew meeting, acceptance, and an ending transmission.

If a visual or audio verification tool is unavailable, report exactly what was and was not checked. Do not claim tools or voice recordings were used when they were not.

---

# 17. IMPLEMENTATION ORDER

1. Audit the existing project and identify the integration points.
2. Build the functioning terminal and its open/close/skip controls.
3. Create Aisyah's finished talking sprite and expression states.
4. Connect one complete Design briefing, intelligence view, and acceptance handover.
5. Add the other story speakers and stage-specific briefings.
6. Coordinate monitor animation, camera framing, sound, and reduced-motion paths.
7. Connect ending transmissions to actual reports.
8. Run progression, interruption, save/resume, visual, audio, and performance checks.
9. Refine the presentation from observed runtime results.

Each phase must leave a working, testable result. Preserve existing playable functionality throughout.

## FINAL REQUIREMENT

The player should see and hear a believable C.R.E.W team communicating through a physical mission screen, understand why their decisions matter to Sarawak's rainforest mission, and feel ready to join the crew.

**Keep the people visibly talking on the screen. Keep the story recognizably Borneo Forest Watch. Make the presentation serve the playable mission.**
