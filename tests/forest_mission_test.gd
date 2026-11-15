extends SceneTree

const DESIGN := ["P1", "P2", "P3", "E1", "E2", "E3", "E4", "E5", "C1", "C2", "C3", "S1", "S2", "S3", "S4", "R1", "R2", "R3", "P4", "P5"]
const EVENTS := ["EV8", "EV6", "C4", "EV3", "EV9", "EV5", "EV4"]

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var script = load("res://scripts/forest_mission.gd")
	assert(script != null, "Forest mission rules exist")
	var mission = script.new()
	for id in DESIGN:
		var card: Dictionary = script.definition(id)
		assert(card.has("title") and card.has("choices") and card.choices.size() >= 2, id)
		assert(mission.choose(id, 0).ok, id)
		if card.has("puzzle"):
			assert(mission.puzzle_result(id, 95).ok)
	assert(mission.review().approved, str(mission.review()))
	var unchanged: Dictionary = mission.state.duplicate(true)
	mission.choose("E3", 0)
	assert(mission.state.cost_m == unchanged.cost_m and mission.state.mass_kg == unchanged.mass_kg, "Repeated choices cannot double-charge")
	assert(not mission.choose("UNKNOWN", 0).ok)
	assert(not mission.choose("P1", -1).ok)
	assert(not mission.puzzle_result("P1", NAN).ok)
	assert(mission.launch(0.0).success)
	assert(mission.launch(1.0).success, "Launch outcome cannot be rerolled")
	for id in EVENTS:
		assert(mission.choose(id, 0).ok)
		assert(mission.puzzle_result(id, 95).ok)
	var report: Dictionary = mission.report()
	assert(report.ending == "E1", str(report))
	assert(mission.state.quarters.size() == 7)
	var restored = script.new(JSON.parse_string(JSON.stringify(mission.state)))
	assert(restored.report().ending == report.ending)
	assert(restored.state.cost_m == mission.state.cost_m)
	var malformed = script.new({"choices": {"P1": -1, "E1": "one", "S1": 999}, "scores": {"P1": "gold"}, "mode": "hacker", "cost_m": -999, "log": 8, "launch_resolved": true, "launch_success": "yes"})
	assert(malformed.state.mode == "cadet" and malformed.state.cost_m >= 0)
	assert(malformed.state.choices.is_empty() and malformed.state.scores.is_empty())
	assert(not malformed.state.launch_resolved)
	check_fail_forward(script)
	var failed = designed(script)
	assert(not failed.launch(1.0).success and failed.report().ending == "E7")
	var no_sandbox = script.new({"mode": "sandbox"})
	assert(no_sandbox.state.mode == "cadet", "There is no sandbox mode")
	var always_fails = designed(script)
	assert(not always_fails.launch(1.0).success, "Launch always follows its reliability roll")
	var engineer = script.new({"mode": "engineer"})
	assert(engineer.puzzle_result("P1", 30).ok)
	assert(engineer.puzzle_result("P1", 90).ok)
	assert(not engineer.puzzle_result("P1", 100).ok)
	var silver = designed(script)
	silver.choose("E3", 1)
	silver.choose("S2", 1)
	for id in ["P1", "E3", "C3", "S2"]:
		silver.puzzle_result(id, 50)
	assert(silver.launch(0.0).success)
	assert(silver.report().ending == "E2")
	var battery = designed(script)
	assert(battery.launch(0.0).success)
	battery.choose("EV3", 0)
	battery.puzzle_result("EV3", 10)
	assert(battery.report().ending == "E5")
	var damaged_restore = script.new(JSON.parse_string(JSON.stringify(battery.state)))
	assert(damaged_restore.report().ending == "E5", "Restore retains operational failures")
	var debris = designed(script)
	assert(debris.launch(0.0).success)
	debris.choose("EV5", 0)
	debris.puzzle_result("EV5", 10, 0.25)
	assert(debris.report().ending == "E6")
	var debris_restore = script.new(JSON.parse_string(JSON.stringify(debris.state)))
	debris_restore.puzzle_result("EV5", 10, 1.0)
	assert(debris_restore.state.rolls.EV5 == 0.25 and debris_restore.report().ending == "E6", "Reloading cannot reroll a debris hit")
	var careful = designed(script)
	assert(careful.launch(0).success)
	careful.choose("EV5", 0)
	careful.puzzle_result("EV5", 100, 0.25)
	assert(not careful.state.debris_loss, "Gold tiers reduce the actual debris hit probability")
	var short_life = designed(script)
	short_life.choose("P1", 2)
	short_life.choose("E4", 1)
	assert(short_life.review().approved, "Space station deployment plus thrusters just meets the 2-year requirement")
	assert(short_life.launch(0.0).success)
	short_life.choose("EV4", 0)
	short_life.puzzle_result("EV4", 10)
	assert(short_life.report().ending == "E4", str(short_life.report()))
	var quiet = designed(script)
	quiet.choose("C1", 2)
	assert(quiet.launch(0.0).success)
	quiet.choose("EV6", 0)
	quiet.puzzle_result("EV6", 0)
	quiet.choose("C4", 0)
	quiet.puzzle_result("C4", 0)
	assert(quiet.report().ending == "E3", str(quiet.report()))
	check_tree_numbers(script)
	check_team_rule(script)
	mission.reset()
	assert(mission.state.choices.is_empty() and not mission.state.launch_resolved)
	print("Forest mission: safe story, endings, revisions, launch cache and save validation passed")
	quit()

func designed(script) -> RefCounted:
	var mission = script.new()
	for id in DESIGN:
		mission.choose(id, 0)
		if script.definition(id).has("puzzle"):
			mission.puzzle_result(id, 95)
	return mission

## Numbers and consequences from decision_trees_by_role.md.
func check_tree_numbers(script) -> void:
	var base = designed(script)
	assert(base.review().approved, str(base.review()))
	# Eclipse: usable Wh / 0.58 h. The 40 Wh pack carries about 20 W, the 80 Wh pack about 41 W.
	assert(absf(base.state.usable_wh / script.ECLIPSE_H - 20.7) < 0.2)
	var big = designed(script)
	big.choose("E3", 1)
	assert(absf(big.state.usable_wh / script.ECLIPSE_H - 41.4) < 0.3)
	# Imager alone is about 15 W average load; the high-resolution camera lifts it to about 22 W.
	# (The worked example is the plain design, before Aisyah staggers any loads in review.)
	var plain = designed(script)
	plain.state.choices.erase("R1")
	plain._recompute()
	assert(absf(plain.state.power_w - 15.4) < 0.5, str(plain.state.power_w))
	var hires = designed(script)
	hires.state.choices.erase("R1")
	hires.choose("S2", 2)
	assert(absf(hires.state.power_w - 22.6) < 0.5, str(hires.state.power_w))
	assert(not hires.review().approved, "The small battery fails with the high-resolution camera")
	assert(hires.review().problems.any(func(p): return p.begins_with("Battery")))
	hires.choose("E3", 1)
	assert(hires.review().problems.any(func(p): return p.begins_with("Solar")), "35 W is just short of load plus recharge")
	# Data per day = Mbps x minutes x 60 / 8000: X-band at Kuching sends 24 GB, S-band only 0.48 GB.
	assert(is_equal_approx(base.state.sent_gb, 24.0))
	var s_band = designed(script)
	s_band.choose("C1", 1)
	assert(is_equal_approx(s_band.state.sent_gb, 0.48) and s_band.state.data_pct < 70 and not s_band.review().approved)
	var network = designed(script)
	network.choose("C2", 1)
	assert(is_equal_approx(network.state.contact_min, 112.0))
	# Bus: the 3U cannot carry the imager; limits are 4, 12 and 24 kg.
	var small = designed(script)
	small.choose("E1", 1)
	assert(small.state.bus_limit_kg == 4 and not small.review().approved)
	var huge = designed(script)
	huge.choose("E1", 2)
	assert(huge.state.bus_limit_kg == 24 and is_equal_approx(huge.state.cost_m - base.state.cost_m, 0.5))
	# Launch options: 0.30 M / 95%, 1.2 M / 92%, space station 400 km about one year.
	assert(is_equal_approx(base.state.reliability, 0.95))
	var dedicated = designed(script)
	dedicated.choose("P1", 1)
	assert(is_equal_approx(dedicated.state.reliability, 0.92) and is_equal_approx(dedicated.state.cost_m - base.state.cost_m, 0.9))
	dedicated.choose("P2", 1)
	assert(dedicated.state.orbit_km == 600 and dedicated.state.life_years >= 20)
	var station = designed(script)
	station.choose("P1", 2)
	assert(station.state.orbit_km == 400 and not station.review().approved, "Station orbit fails the 2-year life requirement")
	station.choose("P2", 1)
	assert(station.state.orbit_km == 400, "Only a dedicated launcher can choose the orbit")
	station.choose("E4", 1)
	assert(station.review().approved, "Thrusters let the station deployment reach two years")
	# Launch check applies a 10% margin; squeezing to the limit gives that up for lower confidence.
	assert(is_equal_approx(base.state.mass_need_kg, base.state.mass_kg * 1.1))
	var squeeze = designed(script)
	squeeze.choose("E5", 2)
	assert(is_equal_approx(squeeze.state.mass_need_kg, squeeze.state.mass_kg) and squeeze.state.reliability < base.state.reliability)

## Team Rule: work alone, launch together. Each decision and event has one owner.
func check_team_rule(script) -> void:
	var owners := {"P": "nova", "E": "orion", "C": "kai", "S": "juno"}
	for id in script.DESIGN_IDS + script.EVENT_IDS:
		var owner: String = script.owner_of(id)
		assert(owner != "", id + " has an owner")
		if id == "P5":
			assert(owner == "team", "Go/no-go is the shared Act 3 decision")
		elif id.begins_with("R") or id == "P4":
			assert(owner == "nova", id + " belongs to Aisyah, who runs the review alone")
		elif id in ["EV8", "EV9"]:
			assert(owner == "juno")
		elif id in ["EV6", "C4"]:
			assert(owner == "kai")
		elif id in ["EV3", "EV4", "EV5"]:
			assert(owner == "orion")
		else:
			assert(owner == owners[id.left(1)], id + " is owned by its department lead")
	for file in ["story", "lunar_story", "relay_story"]:
		var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://data/%s.json" % file))
		for beat in parsed.beats:
			if not beat.has("decision"):
				continue
			var owner: String = script.owner_of(beat.decision)
			assert(beat.get("actor", "") == ("" if owner == "team" else owner), "%s: story actor matches the owner of %s" % [beat.id, beat.decision])

func titles(report: Dictionary) -> Array:
	return report.mistakes.map(func(m): return m.title)

func who(report: Dictionary) -> Array:
	return report.mistakes.map(func(m): return m.who)

## Team vision: poor decisions never block the game. The mission fails, and the report explains why.
func check_fail_forward(script) -> void:
	# A red review is only a warning: the launch still happens.
	var no_camera = designed(script)
	no_camera.choose("S1", 1)
	assert(not no_camera.review().approved)
	var launched: Dictionary = no_camera.launch(0.0)
	assert(launched.success, "A missing camera does not stop the rocket")
	var report: Dictionary = no_camera.report()
	assert("Siti" in who(report) and titles(report).any(func(t): return t.contains("forest camera")))
	assert(report.ending != "E1" and report.score < 90)
	# Too heavy for the rocket: the launch check fails, the story goes on.
	var heavy = designed(script)
	heavy.choose("E1", 1)
	var result: Dictionary = heavy.launch(0.0)
	assert(not result.success and result.ending == "E8" and result.fault == "heavy")
	report = heavy.report()
	assert(report.ending == "E8" and "Jabu" in who(report) and report.score <= 49)
	assert(heavy.choose("EV8", 0).ok == false, "Nothing can be operated after a failed launch")
	# Not enough money.
	var broke = designed(script)
	broke.choose("P1", 1)
	broke.choose("E1", 2)
	assert(broke.state.launch_fault == "money")
	assert(not broke.launch(0.0).success and "Aisyah" in who(broke.report()))
	# Bad luck is explained too.
	var unlucky = designed(script)
	assert(not unlucky.launch(1.0).success)
	assert("Luck" in who(unlucky.report()) and unlucky.report().ending == "E7")
	# A small battery and a power-hungry camera: the satellite goes dark in orbit.
	var dark = designed(script)
	dark.choose("S2", 2)
	assert(dark.launch(0.0).success)
	report = dark.report()
	assert(report.ending == "E5" and titles(report).any(func(t): return t.contains("battery")))
	# A low orbit: the satellite comes down early.
	var low = designed(script)
	low.choose("P1", 2)
	assert(low.launch(0.0).success)
	report = low.report()
	assert(report.ending == "E4" and titles(report).any(func(t): return t.contains("came down")))
	# A slow radio: not enough photos get home.
	var slow = designed(script)
	slow.choose("C1", 1)
	assert(slow.launch(0.0).success)
	assert(titles(slow.report()).any(func(t): return t.contains("radio was too slow")))
	# A perfect design has nothing to fix and every finding is plain language.
	var good = designed(script)
	assert(good.launch(0.0).success)
	report = good.report()
	assert(report.mistakes.is_empty() and report.wins.size() >= 6)
	for finding in report.wins:
		assert(finding.length() < 70, "Short sentences: " + finding)
	for lost in [no_camera, heavy, broke, unlucky, dark, low, slow]:
		for m in lost.report().mistakes:
			assert(m.why.length() < 190 and m.title.length() < 60 and m.fix.length() < 100, "Findings stay short: " + m.title)
