class_name ForestMission
extends RefCounted

const DESIGN_IDS := ["P1", "P2", "P3", "E1", "E2", "E3", "E4", "E5", "C1", "C2", "C3", "S1", "S2", "S3", "S4", "R1", "R2", "R3", "P4", "P5"]
const EVENT_IDS := ["EV8", "EV6", "C4", "EV3", "EV9", "EV5", "EV4"]
const CORE_IDS := ["P1", "E3", "C3", "S2"]
const ENDINGS := {
	"E1": ["Guardians of the Canopy", "You gave Sarawak eyes in the sky. This is only the first.", "Keep your margins and teamwork on the next mission."],
	"E2": ["First Light, Well Done", "Not perfect. But look what you learned.", "Improve puzzle tiers while preserving your margins."],
	"E3": ["The Quiet Satellite", "It's alive. Now let's help it say more.", "Protect downlink passes and science time."],
	"E4": ["Too Low, Too Soon", "A bright flash. Let's build one that stays.", "Choose an orbit and operating plan that last two years."],
	"E5": ["Lights Out", "It went dark. Plan for the night next time.", "Fit a larger battery and shed loads during eclipse."],
	"E6": ["Close Call", "Space is crowded. Give it a way to step aside.", "Fit thrusters and steer early when debris approaches."],
	"E7": ["The Rocket's Bad Day", "Launch is hard. Even the best have bad days.", "Choose a reliable launcher. Luck is part of launch."],
	"E8": ["Back to the Drawing Board", "Not ready, and that's fine. Better here than in orbit.", "Use the requirement list to fix the first red gauge."]
}
static var _cards: Dictionary = {}
var state: Dictionary

static func definition(id: String) -> Dictionary:
	if _cards.is_empty():
		var file := FileAccess.open("res://data/forest_decisions.json", FileAccess.READ)
		if file != null:
			var parsed = JSON.parse_string(file.get_as_text())
			if parsed is Dictionary:
				_cards = parsed
	var card = _cards.get(id, {})
	return card.duplicate(true) if card is Dictionary else {}

func _init(saved: Dictionary = {}) -> void:
	reset()
	if saved.get("mode", "") in ["cadet", "engineer", "sandbox"]:
		state.mode = saved.mode
	var selected = saved.get("choices", {})
	if selected is Dictionary:
		for id in selected:
			if not id is String:
				continue
			var card := definition(id)
			var index = selected[id]
			if not card.is_empty() and _number(index) and index == int(index) and index >= 0 and index < card.choices.size():
				state.choices[id] = int(index)
	var scores = saved.get("scores", {})
	if scores is Dictionary:
		for id in scores:
			if id is String and definition(id).has("puzzle") and _number(scores[id]):
				state.scores[id] = clampf(float(scores[id]), 0, 100)
				state.attempts[id] = 1
	var attempts = saved.get("attempts", {})
	if attempts is Dictionary:
		for id in state.scores:
			if _number(attempts.get(id)):
				state.attempts[id] = clampi(int(attempts[id]), 1, 1000)
	if _number(saved.get("revisions")):
		state.revisions = clampi(int(saved.revisions), 0, 1000)
	if saved.get("rolls") is Dictionary:
		for id in EVENT_IDS:
			if _number(saved.rolls.get(id)):
				state.rolls[id] = clampf(float(saved.rolls[id]), 0, 1)
	_recompute()
	if saved.get("launch_resolved") is bool and saved.launch_resolved and saved.get("launch_success") is bool:
		# Validate the prelaunch design; operational damage must survive a reload.
		var operations := {}
		var operation_scores := {}
		for id in EVENT_IDS:
			if state.choices.has(id):
				operations[id] = state.choices[id]
				state.choices.erase(id)
			if state.scores.has(id):
				operation_scores[id] = state.scores[id]
				state.scores.erase(id)
		_recompute()
		var valid_design: bool = review().approved
		state.choices.merge(operations)
		state.scores.merge(operation_scores)
		if valid_design:
			state.launch_resolved = true
			state.launch_success = saved.launch_success
		_recompute()

static func _number(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value))

func reset() -> void:
	state = {"mode": "cadet", "choices": {}, "scores": {}, "attempts": {}, "rolls": {}, "revisions": 0, "launch_resolved": false, "launch_success": false}
	_recompute()

func choose(id: String, index: int) -> Dictionary:
	var card := definition(id)
	if card.is_empty() or index < 0 or index >= card.choices.size():
		return {"ok": false, "feedback": "That decision is unavailable."}
	if state.launch_resolved and not EVENT_IDS.has(id):
		return {"ok": false, "feedback": "The design is locked after launch. Start again to redesign."}
	if EVENT_IDS.has(id) and (not state.launch_resolved or not state.launch_success):
		return {"ok": false, "feedback": "Operations begin after a successful launch."}
	if state.choices.has(id) and state.choices[id] != index and not EVENT_IDS.has(id):
		state.revisions += 1
	state.choices[id] = index
	_recompute()
	return {"ok": true, "feedback": card.choices[index].detail}

func puzzle_result(id: String, score: float, roll: float = -1) -> Dictionary:
	var card := definition(id)
	if not card.has("puzzle") or not is_finite(score):
		return {"ok": false, "feedback": "This puzzle result is invalid."}
	if state.launch_resolved and not EVENT_IDS.has(id):
		return {"ok": false, "feedback": "Design puzzles close at launch."}
	if EVENT_IDS.has(id) and (not state.launch_resolved or not state.launch_success):
		return {"ok": false, "feedback": "Launch successfully before operating the satellite."}
	if state.mode == "engineer" and int(state.attempts.get(id, 0)) >= 2:
		return {"ok": false, "feedback": "Engineer mode allows one retry per puzzle."}
	state.scores[id] = clampf(score, 0, 100)
	state.attempts[id] = int(state.attempts.get(id, 0)) + 1
	if id == "EV5" and not state.rolls.has(id):
		state.rolls[id] = randf() if roll < 0 else clampf(roll if is_finite(roll) else 1.0, 0, 1)
	_recompute()
	var tier := _tier(score)
	return {"ok": true, "tier": tier, "feedback": "%s: %s (%d/100). %s" % [card.title, tier, int(clampf(score, 0, 100)), "Event chance -5." if tier == "Gold" else ("Event chance +10." if tier == "Bronze" else "Event chance unchanged.")]}

static func _tier(score: float) -> String:
	return "Gold" if score >= 80 else ("Silver" if score >= 50 else "Bronze")

func _recompute() -> void:
	# Rebuild contributions from choices: changing a card replaces its effect.
	var base := {"cost_m": .55, "mass_kg": 1.2, "launch_limit_kg": 6.0, "bus_limit_kg": 6.0, "power_w": 8.0, "solar_w": 14.0, "battery_wh": 20.0, "data_pct": 70.0, "life_years": 2.4, "months": 18.0, "imager": true, "sarawak": true, "thrusters": false, "reliability": .95, "orbit_km": 500.0, "science_bonus": 0.0, "thermal": false, "backup_station": false, "radio": "S", "reserve_m": 0.0, "priority": "safety", "reliability_bonus": 0.0, "debris_risk": false}
	for key in base:
		state[key] = base[key]
	state.log = []
	state.quarters = []
	state.tiers = {}
	state.event_chance = 20.0
	state.battery_failed = false
	state.debris_loss = false
	for id in DESIGN_IDS + EVENT_IDS:
		if not state.choices.has(id):
			continue
		var card := definition(id)
		var choice: Dictionary = card.choices[state.choices[id]]
		# The launch provider fixes a rideshare orbit.
		var effects: Dictionary = choice.effects
		if id == "P2" and int(state.choices.get("P1", 0)) != 1:
			effects = {}
			state.log.append("P2: The rocket decides the rideshare orbit.")
		for key in effects:
			var value = effects[key]
			if key in ["launch_limit_kg", "bus_limit_kg", "reliability", "orbit_km"] or value is bool or value is String:
				state[key] = value
			else:
				state[key] = float(state.get(key, 0)) + float(value)
		state.log.append("%s: %s. %s" % [id, choice.label, choice.detail])
	for id in state.scores:
		var tier := _tier(float(state.scores[id]))
		state.tiers[id] = tier
		state.event_chance += -5 if tier == "Gold" else (10 if tier == "Bronze" else 0)
		state.log.append("%s puzzle: %s (%d/100)." % [id, tier, int(state.scores[id])])
	for id in EVENT_IDS:
		if not state.choices.has(id) and not state.scores.has(id):
			continue
		var score := float(state.scores.get(id, 65))
		var loss := clampf((80.0 - score) / 80.0, 0, 1)
		state.quarters.append({"quarter": int(definition(id).quarter), "event": id, "tier": _tier(score), "score": score})
		match id:
			"EV8":
				state.science_bonus -= loss * (1 if state.thermal else 5)
			"EV6":
				state.data_pct -= loss * (4 if state.backup_station else 18)
			"C4":
				state.data_pct -= loss * (24 if state.radio == "Ka" else 10)
			"EV3":
				# A long eclipse is 55 minutes; good triage sheds science loads.
				var eclipse_load := maxf(4, state.power_w - (8 if score >= 50 else 0))
				if state.battery_wh * .6 < eclipse_load * 55.0 / 60.0:
					state.battery_failed = true
					state.log.append("The battery ran flat during the long eclipse: %.0f Wh pack, %.1f W active load." % [state.battery_wh, eclipse_load])
			"EV9":
				state.science_bonus -= loss * 6
				state.life_years -= loss * .25
			"EV5":
				var chance := clampf(state.event_chance / 100.0 + loss * 0.45 + (0.25 if state.debris_risk else 0.0), 0, 0.95)
				if not state.thrusters and state.rolls.has(id) and float(state.rolls[id]) < chance:
					state.debris_loss = true
					state.log.append("Debris hit roll: %.0f%% risk after puzzle tiers. No thrusters were fitted." % (chance * 100))
				elif score < 50:
					state.life_years -= loss * .25
			"EV4":
				state.battery_wh -= loss * 10
				state.life_years -= loss * .45
				if score < 50 and state.battery_wh * .6 < state.power_w * 35.0 / 60.0:
					state.battery_failed = true
	state.mass_limit_kg = minf(state.launch_limit_kg, state.bus_limit_kg)
	state.reliability = clampf(state.reliability + state.reliability_bonus, 0, 1)
	state.data_pct = clampf(state.data_pct, 0, 100)
	state.event_chance = clampf(state.event_chance, 0, 95)
	state.battery_wh = maxf(state.battery_wh, 0)
	state.life_years = maxf(state.life_years, 0)
	if state.launch_resolved:
		state.log.append("Launch: signal acquired." if state.launch_success else "Launch vehicle lost. Luck, not skill, decided this outcome.")

func requirements() -> Array:
	return [
		{"label": "Forest imager on board", "value": "Installed" if state.imager else "Missing", "met": bool(state.imager)},
		{"label": "Cover Sarawak", "value": "Covered" if state.sarawak else "Off target", "met": bool(state.sarawak)},
		{"label": "Data returned ≥ 70%", "value": "%.1f%%" % state.data_pct, "met": state.data_pct >= 70},
		{"label": "Life ≥ 2 years", "value": "%.2f years" % state.life_years, "met": state.life_years >= 2},
		{"label": "Budget ≤ 2.5 M", "value": "%.2f / 2.50 M" % state.cost_m, "met": state.cost_m <= 2.5},
		{"label": "Mass in limit", "value": "%.2f / %.2f kg" % [state.mass_kg, state.mass_limit_kg], "met": state.mass_kg <= state.mass_limit_kg},
		{"label": "Ready in ≤ 24 months", "value": "%.0f / 24 months" % state.months, "met": state.months <= 24},
		{"label": "Solar supports load and charging", "value": "%.1f W load / %.1f W solar" % [state.power_w, state.solar_w], "met": state.power_w <= state.solar_w * .85},
		{"label": "Battery survives 35 min shadow", "value": "%.0f Wh pack; %.1f Wh needed" % [state.battery_wh, state.power_w * 35.0 / 60.0], "met": state.battery_wh * .6 >= state.power_w * 35.0 / 60.0 and not state.battery_failed}
	]

func review() -> Dictionary:
	var problems: Array[String] = []
	for item in requirements():
		if not item.met:
			problems.append("%s: %s" % [item.label, item.value])
	return {"approved": problems.is_empty(), "problems": problems}

func launch(roll: float = -1) -> Dictionary:
	if state.launch_resolved:
		return _launch_result()
	if not review().approved:
		return {"success": false, "ending": "E8", "headline": ENDINGS.E8[0], "feedback": review().problems[0]}
	if not is_finite(roll):
		roll = 1
	if roll < 0:
		roll = randf()
	state.launch_success = state.mode == "sandbox" or clampf(roll, 0, 1) < state.reliability
	state.launch_resolved = true
	_recompute()
	return _launch_result()

func _launch_result() -> Dictionary:
	return {"success": bool(state.launch_success), "ending": "" if state.launch_success else "E7", "headline": "Signal acquired!" if state.launch_success else ENDINGS.E7[0]}

func report() -> Dictionary:
	var checklist := requirements()
	var met := 0
	for item in checklist:
		met += int(item.met)
	var quality := 80.0
	if not state.scores.is_empty():
		quality = 0
		for value in state.scores.values():
			quality += float(value)
		quality /= state.scores.size()
	var objective := 40.0 * met / checklist.size()
	var science := clampf((12 + state.science_bonus) * quality / 90.0, 0, 20) if state.imager else 0.0
	var efficiency := clampf(8 + (1 - state.mass_kg / state.mass_limit_kg) * 12 + (1 - state.power_w / state.solar_w) * 6, 0, 15)
	var teamwork := maxf(0, 15 - state.revisions)
	var budget := 10.0 if state.cost_m <= 2.5 else 0.0
	var total := int(round(objective + science + efficiency + teamwork + budget))
	if state.data_pct < 70 or science < 10:
		total = mini(total, 69)
	var ending := "E1" if total >= 90 and met == checklist.size() else ("E2" if total >= 70 else ("E3" if total >= 50 else "E8"))
	if not state.launch_resolved:
		ending = "E8"
	elif not state.launch_success:
		ending = "E7"
	elif state.battery_failed:
		ending = "E5"
	elif state.debris_loss:
		ending = "E6"
	elif state.life_years < 2:
		ending = "E4"
	var grade := "Flight Director" if total >= 90 else ("Mission Engineer" if total >= 70 else ("Cadet" if total >= 50 else "Back to the Drawing Board"))
	var roles := {}
	for role in {"Planner": "P", "Engineer": "E", "Comms": "C", "Science": "S"}:
		var entries: Array = []
		var prefix: String = {"Planner": "P", "Engineer": "E", "Comms": "C", "Science": "S"}[role]
		for id in DESIGN_IDS:
			if id.begins_with(prefix) and state.choices.has(id):
				entries.append({"id": id, "decision": definition(id).choices[state.choices[id]].label, "tier": state.tiers.get(id, "Not scored"), "score": state.scores.get(id, -1)})
		roles[role] = entries
	return {"ending": ending, "headline": ENDINGS[ending][0], "grade": grade, "score": total, "requirements": checklist, "log": state.log.duplicate(), "tip": ENDINGS[ending][2], "speech": ENDINGS[ending][1], "role_scorecards": roles, "breakdown": {"objective": objective, "science": science, "efficiency": efficiency, "teamwork": teamwork, "budget": budget}}

func summary() -> String:
	return "%.2f/2.50 M · %.2f/%.0f kg · %.0f/%.0f W · %.0f Wh · %.0f%% data · %.1f yr · %.0f/24 mo" % [state.cost_m, state.mass_kg, state.mass_limit_kg, state.power_w, state.solar_w, state.battery_wh, state.data_pct, state.life_years, state.months]
