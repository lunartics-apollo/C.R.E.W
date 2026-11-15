class_name ForestMission
extends RefCounted

const DESIGN_IDS := ["P1", "P2", "P3", "E1", "E2", "E3", "E4", "E5", "C1", "C2", "C3", "S1", "S2", "S3", "S4", "R1", "R2", "R3", "P4", "P5"]
const EVENT_IDS := ["EV8", "EV6", "C4", "EV3", "EV9", "EV5", "EV4"]
const CORE_IDS := ["P1", "E3", "C3", "S2"]
# Shared reference numbers from the decision trees (draft game values).
const ECLIPSE_H := 0.58            # about 35 minutes of shadow each orbit
const LONG_ECLIPSE_H := 55.0 / 60.0
const USABLE_FRACTION := 0.3       # 40 Wh pack = 12 Wh usable, 80 Wh pack = 24 Wh usable
const RECHARGE_FACTOR := 1.6       # array watts needed per watt of average load
const BUS_LOAD_W := 5.0            # avionics and housekeeping
# Effects on these keys replace the value; every other numeric key is added.
const SET_KEYS := ["launch_cap_kg", "bus_limit_kg", "reliability", "orbit_km", "array_w", "battery_wh", "radio_mbps", "radio_w", "contact_min", "margin_pct"]
const ENDINGS := {
	"E1": ["Guardians of the Canopy", "You gave Sarawak eyes in the sky. This is only the first.", "Great job! Try a harder mode, or build it with different parts.", "Everything worked. The satellite watched the forest for two whole years."],
	"E2": ["First Light, Well Done", "Not perfect. But look what you learned.", "Look at the small problems below and fix them next time.", "The satellite worked and watched the forest, but a few things were not perfect."],
	"E3": ["The Quiet Satellite", "It's alive. Now let's help it say more.", "Make sure the radio can send all the photos home.", "The satellite stayed alive, but too few photos or too little science came home."],
	"E4": ["Too Low, Too Soon", "A bright flash. Let's build one that stays.", "Pick a higher orbit, or add thrusters to keep it up.", "The satellite fell out of orbit before two years were over."],
	"E5": ["Lights Out", "It went dark. Plan for the night next time.", "Pick a bigger battery and bigger solar panels.", "The battery ran flat in the dark, so the satellite switched off."],
	"E6": ["Close Call", "Space is crowded. Give it a way to step aside.", "Add small thrusters so the satellite can dodge junk.", "Space junk hit the satellite because it could not move away."],
	"E7": ["The Rocket's Bad Day", "Launch is hard. Even the best have bad days.", "Pick a more reliable rocket. Some luck is always part of a launch.", "The rocket failed on launch day, and the satellite was lost."],
	"E8": ["Back to the Drawing Board", "Not ready, and that's fine. Better here than in orbit.", "Read what went wrong, then change those choices.", "The launch could not go ahead. Something was not ready."]
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
	if saved.get("mode", "") in ["cadet", "engineer"]:
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

static func owner_of(id: String) -> String:
	return str(definition(id).get("owner", ""))

static func base_life(orbit_km: float) -> float:
	# Drag decides lifetime: 400 km about 1 year, 500 km about 5, 600 km 20 or more.
	return 1.0 if orbit_km <= 400 else (5.0 if orbit_km <= 500 else 20.0)

func _recompute() -> void:
	# Rebuild contributions from choices: changing a card replaces its effect.
	var base := {"cost_m": 0.0, "mass_kg": 1.5, "instr_mass_kg": 0.0, "launch_cap_kg": 24.0, "bus_limit_kg": 12.0, "bus_fits_imager": true, "power_w": 0.0, "instr_w": 0.0, "array_w": 12.0, "solar_extra_w": 0.0, "battery_wh": 40.0, "radio_mbps": 2.0, "radio_w": 5.0, "contact_min": 32.0, "contact_extra_min": 0.0, "command_pass": false, "data_gb": 0.0, "data_mult": 1.0, "data_pct_delta": 0.0, "life_delta": 0.0, "battery_wh_delta": 0.0, "margin_pct": 10.0, "months": 18.0, "imager": false, "sarawak": true, "thrusters": false, "reliability": .95, "orbit_km": 500.0, "science_bonus": 0.0, "thermal": false, "backup_station": false, "radio": "S", "reserve_m": 0.0, "priority": "safety", "reliability_bonus": 0.0, "debris_risk": false}
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
		# Only a dedicated launcher lets the Planner pick the orbit.
		var effects: Dictionary = choice.effects
		if id == "P2" and int(state.choices.get("P1", 0)) != 1:
			effects = {}
			state.log.append("P2: The launch option fixes the orbit at %.0f km." % state.orbit_km)
		for key in effects:
			var value = effects[key]
			if key in SET_KEYS or value is bool or value is String:
				state[key] = value
			elif key == "data_mult":
				state[key] = float(state.get(key, 1)) * float(value)
			else:
				state[key] = float(state.get(key, 0)) + float(value)
		state.log.append("%s: %s. %s" % [id, choice.label, choice.detail])
	for id in state.scores:
		var tier := _tier(float(state.scores[id]))
		state.tiers[id] = tier
		state.event_chance += -5 if tier == "Gold" else (10 if tier == "Bronze" else 0)
		state.log.append("%s puzzle: %s (%d/100)." % [id, tier, int(state.scores[id])])
	# Derived numbers follow the formulas in the decision trees.
	state.mass_other_kg = state.mass_kg
	state.mass_kg = state.mass_other_kg + state.instr_mass_kg
	state.mass_limit_kg = minf(state.launch_cap_kg, state.bus_limit_kg)
	state.mass_need_kg = state.mass_kg * (1.0 + state.margin_pct / 100.0)
	var contact: float = state.contact_min + state.contact_extra_min
	state.radio_avg_w = state.radio_w * contact / 1440.0
	state.sys_w = state.power_w
	state.power_w = BUS_LOAD_W + state.sys_w + state.instr_w + state.radio_avg_w
	state.solar_w = state.array_w + state.solar_extra_w
	state.battery_wh = maxf(0.0, state.battery_wh + state.battery_wh_delta)
	state.usable_wh = state.battery_wh * USABLE_FRACTION
	state.generated_gb = state.data_gb * state.data_mult
	# Data sent per day = Mbps x contact minutes x 60 / 8000. A reserved command pass costs about 10%.
	state.sent_gb = state.radio_mbps * contact * (0.9 if state.command_pass else 1.0) * 60.0 / 8000.0
	state.data_pct = 100.0 if state.generated_gb <= 0 else minf(100.0, state.sent_gb / state.generated_gb * 100.0)
	state.data_pct += state.data_pct_delta
	state.life_years = base_life(state.orbit_km) + (0.0 if not state.thrusters else (1.5 if state.orbit_km <= 400 else 1.0)) + state.life_delta
	# A launch can be stopped by a hard fault: too heavy, too expensive or too late.
	state.launch_fault = ""
	if state.mass_need_kg > state.mass_limit_kg:
		state.launch_fault = "heavy"
	elif state.cost_m + state.reserve_m > 2.5:
		state.launch_fault = "money"
	elif state.months > 24:
		state.launch_fault = "late"
	# A weak power design shows up in orbit: the satellite cannot get through the night.
	if state.launch_resolved and state.launch_success:
		var night_watts: float = state.usable_wh / ECLIPSE_H
		if night_watts < state.power_w:
			state.battery_failed = true
			state.log.append("The %.0f Wh battery gives only %.1f W at night, but we use %.1f W." % [state.battery_wh, night_watts, state.power_w])
		elif state.solar_w < state.power_w * RECHARGE_FACTOR:
			state.battery_failed = true
			state.log.append("The panels make %.0f W but we need %.0f W to recharge." % [state.solar_w, state.power_w * RECHARGE_FACTOR])
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
				# A commercial network loses less than a single station.
				state.data_pct -= loss * (4 if state.backup_station else 18)
			"C4":
				# Ka-band drops sharply in rain, X-band loses some, S-band barely changes.
				state.data_pct -= loss * (24 if state.radio == "Ka" else (10 if state.radio == "X" else 2))
			"EV3":
				# A long eclipse is 55 minutes; good triage sheds science loads.
				var eclipse_load := maxf(4.0, state.power_w - (8.0 if score >= 80 else (4.0 if score >= 50 else 0.0)))
				if state.usable_wh / LONG_ECLIPSE_H < eclipse_load:
					state.battery_failed = true
					state.log.append("The battery ran flat during the long eclipse: the %.0f Wh pack carries about %.1f W, the load was %.1f W." % [state.battery_wh, state.usable_wh / LONG_ECLIPSE_H, eclipse_load])
			"EV9":
				# A reserved command pass lets the team recover from the fault.
				var soften := 0.6 if state.command_pass else 1.0
				state.science_bonus -= loss * 6 * soften
				state.life_years -= loss * .25 * soften
			"EV5":
				var chance := clampf(state.event_chance / 100.0 + loss * 0.45 + (0.25 if state.debris_risk else 0.0), 0, 0.95)
				if not state.thrusters and state.rolls.has(id) and float(state.rolls[id]) < chance:
					state.debris_loss = true
					state.log.append("Debris hit roll: %.0f%% risk after puzzle tiers. No thrusters were fitted." % (chance * 100))
				elif score < 50:
					state.life_years -= loss * .25
			"EV4":
				state.battery_wh = maxf(0.0, state.battery_wh - loss * 10)
				state.usable_wh = state.battery_wh * USABLE_FRACTION
				state.life_years -= loss * 1.0
				if score < 50 and state.usable_wh / ECLIPSE_H < state.power_w:
					state.battery_failed = true
					state.log.append("The battery ran flat after overheating: the %.0f Wh pack now carries about %.1f W, the load was %.1f W." % [state.battery_wh, state.usable_wh / ECLIPSE_H, state.power_w])
	state.reliability = clampf(state.reliability + state.reliability_bonus, 0, 1)
	state.data_pct = clampf(state.data_pct, 0, 100)
	state.event_chance = clampf(state.event_chance, 0, 95)
	state.battery_wh = maxf(state.battery_wh, 0)
	state.life_years = maxf(state.life_years, 0)
	if state.launch_resolved:
		state.log.append("Launch: signal acquired." if state.launch_success else "Launch vehicle lost. Luck, not skill, decided this outcome.")

func requirements() -> Array:
	var carries: float = state.usable_wh / ECLIPSE_H
	var imager_ok: bool = bool(state.imager) and bool(state.bus_fits_imager)
	return [
		{"label": "Forest camera on board", "value": "Installed" if imager_ok else ("Does not fit this box" if state.imager else "Missing"), "met": imager_ok},
		{"label": "Covers Sarawak", "value": "Yes" if state.sarawak else "No, looking away", "met": bool(state.sarawak)},
		{"label": "Photos sent home: 70% or more", "value": "%.0f%% (%.1f of %.1f GB a day)" % [state.data_pct, minf(state.sent_gb, state.generated_gb), state.generated_gb], "met": state.data_pct >= 70},
		{"label": "Lasts 2 years or more", "value": "%.1f years" % state.life_years, "met": state.life_years >= 2},
		{"label": "Cost: 2.5 M or less", "value": "%.2f M + %.2f M in the jar (max 2.50 M)" % [state.cost_m, state.reserve_m], "met": state.cost_m + state.reserve_m <= 2.5},
		{"label": "Weight fits the limit", "value": "%.1f kg + %.0f%% spare = %.1f kg (max %.0f kg)" % [state.mass_kg, state.margin_pct, state.mass_need_kg, state.mass_limit_kg], "met": state.mass_need_kg <= state.mass_limit_kg},
		{"label": "Ready in 24 months or less", "value": "%.0f months (max 24)" % state.months, "met": state.months <= 24},
		{"label": "Solar power is enough", "value": "uses %.1f W, panels make %.1f W (need %.1f W)" % [state.power_w, state.solar_w, state.power_w * RECHARGE_FACTOR], "met": state.solar_w >= state.power_w * RECHARGE_FACTOR},
		{"label": "Battery lasts the 35-minute night", "value": "%.0f Wh battery gives %.1f W, we use %.1f W" % [state.battery_wh, carries, state.power_w], "met": carries >= state.power_w and not state.battery_failed}
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
	if not is_finite(roll):
		roll = 1
	if roll < 0:
		roll = randf()
	state.launch_resolved = true
	state.launch_success = state.launch_fault == "" and clampf(roll, 0, 1) < state.reliability
	_recompute()
	return _launch_result()

func _launch_result() -> Dictionary:
	if state.launch_success:
		return {"success": true, "ending": "", "headline": "Signal acquired!"}
	var faulty: bool = state.launch_fault != ""
	return {"success": false, "ending": "E8" if faulty else "E7", "headline": ENDINGS["E8" if faulty else "E7"][0], "fault": state.launch_fault}

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
	var efficiency := clampf(8 + (1 - state.mass_need_kg / maxf(0.1, state.mass_limit_kg)) * 12 + (1 - state.power_w / maxf(1.0, state.solar_w)) * 6, 0, 15)
	var teamwork := maxf(0, 15 - state.revisions)
	var budget := 10.0 if state.cost_m <= 2.5 else 0.0
	var total := int(round(objective + science + efficiency + teamwork + budget))
	if state.data_pct < 70 or science < 10:
		total = mini(total, 69)
	var ending := "E1" if total >= 90 and met == checklist.size() else ("E2" if total >= 70 else ("E3" if total >= 50 else "E8"))
	if not state.launch_resolved or state.launch_fault != "":
		ending = "E8"
	elif not state.launch_success:
		ending = "E7"
	elif state.battery_failed:
		ending = "E5"
	elif state.debris_loss:
		ending = "E6"
	elif state.life_years < 2:
		ending = "E4"
	if ending in ["E7", "E8"] and state.launch_resolved:
		total = mini(total, 49)
	elif ending in ["E4", "E5", "E6"]:
		total = mini(total, 69)
	var grade := "Flight Director" if total >= 90 else ("Mission Engineer" if total >= 70 else ("Cadet" if total >= 50 else "Back to the Drawing Board"))
	var roles := {}
	# Each lead owns their own decisions; Aisyah also owns the integration review.
	var owners := {"Aisyah (Planner)": ["P", "R"], "Jabu (Engineer)": ["E"], "Ling (Comms)": ["C"], "Siti (Science)": ["S"]}
	for role in owners:
		var entries: Array = []
		for id in DESIGN_IDS:
			for prefix in owners[role]:
				if id.begins_with(prefix) and state.choices.has(id):
					entries.append({"id": id, "decision": definition(id).choices[state.choices[id]].label, "tier": state.tiers.get(id, "Not scored"), "score": state.scores.get(id, -1)})
					break
		roles[role] = entries
	var findings := plain_findings()
	return {"ending": ending, "story": ENDINGS[ending][3], "wins": findings.wins, "mistakes": findings.mistakes, "headline": ENDINGS[ending][0], "grade": grade, "score": total, "requirements": checklist, "log": state.log.duplicate(), "tip": ENDINGS[ending][2], "speech": ENDINGS[ending][1], "role_scorecards": roles, "breakdown": {"objective": objective, "science": science, "efficiency": efficiency, "teamwork": teamwork, "budget": budget}}

func summary() -> String:
	return "COST %.2f/2.5M MASS %.1f/%.0fkg POWER %.0f/%.0fW BATT %.0fWh DATA %.0f%% LIFE %.0fy TIME %.0f/24" % [state.cost_m + state.reserve_m, state.mass_kg, state.mass_limit_kg, state.power_w, state.solar_w, state.battery_wh, state.data_pct, state.life_years, state.months]

## Who did what, in words a young player can follow. Every problem names the lead, says why it
## happened and what to try next time.
func plain_findings() -> Dictionary:
	var wins: Array[String] = []
	var mistakes: Array[Dictionary] = []
	var st := state
	var flown: bool = bool(st.launch_resolved) and bool(st.launch_success)
	var unseen := "" if flown else " The rocket failed first, so we never saw this in orbit."
	var night_watts: float = st.usable_wh / ECLIPSE_H
	# Launch day
	if st.launch_resolved and st.launch_fault == "heavy":
		mistakes.append({"who": "Jabu", "title": "The satellite was too heavy for the rocket.", "why": "It weighs %.1f kg, plus %.0f%% spare room. The rocket can lift only %.0f kg." % [st.mass_kg, st.margin_pct, st.mass_limit_kg], "fix": "Choose a smaller box or lighter parts. Keep some spare room."})
	elif st.launch_resolved and st.launch_fault == "money":
		mistakes.append({"who": "Aisyah", "title": "We ran out of money.", "why": "We spent %.2f M and kept %.2f M in the jar. We only had 2.5 M." % [st.cost_m, st.reserve_m], "fix": "Choose a cheaper rocket or cheaper parts. Ask: do we need this extra?"})
	elif st.launch_resolved and st.launch_fault == "late":
		mistakes.append({"who": "Aisyah and Jabu", "title": "We were too late for the launch.", "why": "The plan took %.0f months. We only had 24." % st.months, "fix": "Do not choose things that add months, like rushing parts or waiting."})
	elif st.launch_resolved and not st.launch_success:
		mistakes.append({"who": "Luck", "title": "The rocket failed on launch day.", "why": "This rocket is %.0f%% reliable. That means about %d in 100 launches fail." % [st.reliability * 100.0, 100 - int(round(st.reliability * 100.0))], "fix": "Pick a more reliable rocket. Even a good plan can have bad luck."})
	elif flown:
		wins.append("The rocket launched and the satellite called home.")
	# Camera and where it looks
	if not st.imager:
		mistakes.append({"who": "Siti", "title": "We left the forest camera at home.", "why": "Without the camera we cannot watch the forest. The mission has no point." + unseen, "fix": "Always fly the forest camera."})
	elif not st.bus_fits_imager:
		mistakes.append({"who": "Jabu", "title": "The camera did not fit in the box.", "why": "The small 3U box is only 4 kg. The camera does not fit inside." + unseen, "fix": "Choose the 6U box or bigger."})
	else:
		wins.append("The forest camera is on board.")
	if not st.sarawak:
		mistakes.append({"who": "Siti", "title": "The camera looked away from Sarawak.", "why": "Our forest was not in the pictures." + unseen, "fix": "Pick Wide view or Close-up detail."})
	else:
		wins.append("The camera watches Sarawak.")
	# Photos and radio
	if st.data_pct < 70:
		var who := "Ling" if st.radio == "S" else "Ling and Siti"
		var title := "The radio was too slow for our photos." if st.radio == "S" else "Not enough photos got home."
		mistakes.append({"who": who, "title": title, "why": "We take %.1f GB of photos a day. The radio can send only %.1f GB. So %.0f%% got home." % [st.generated_gb, st.sent_gb, st.data_pct] + unseen, "fix": "Use the X-band radio, rent the dish network, or take fewer photos."})
	else:
		wins.append("%.0f%% of the photos got home. We needed 70%%." % st.data_pct)
	# Orbit and life
	if st.life_years < 2:
		mistakes.append({"who": "Aisyah", "title": "The satellite came down too soon.", "why": "At %.0f km the satellite lasts only about %.1f years. We needed 2 years." % [st.orbit_km, st.life_years] + unseen, "fix": "Choose a higher orbit, or ask Jabu for thrusters."})
	else:
		wins.append("The satellite stays up for %.0f years or more." % minf(st.life_years, 99.0))
	# Power: panels and battery
	if night_watts < st.power_w:
		mistakes.append({"who": "Jabu", "title": "The battery was too small for the night.", "why": "At night the %.0f Wh battery gives only %.0f W. We use %.0f W." % [st.battery_wh, night_watts, st.power_w] + unseen, "fix": "Choose the big battery, or use less power."})
	elif st.solar_w < st.power_w * RECHARGE_FACTOR:
		mistakes.append({"who": "Jabu", "title": "The solar panels were too small.", "why": "We use %.0f W. The panels make %.0f W. We need about %.0f W to recharge the battery." % [st.power_w, st.solar_w, st.power_w * RECHARGE_FACTOR] + unseen, "fix": "Choose the fold-out panels, or use less power."})
	else:
		wins.append("The panels and battery made enough power.")
	if st.battery_failed and night_watts >= st.power_w and st.solar_w >= st.power_w * RECHARGE_FACTOR:
		mistakes.append({"who": "Jabu", "title": "The battery ran flat during a bad night.", "why": "The long night lasts 55 minutes. A small or hot battery cannot last that long.", "fix": "Pick the big battery, and turn off big loads early."})
	# Money, weight and time
	if st.cost_m + st.reserve_m <= 2.5:
		wins.append("We stayed inside the 2.5 M budget.")
	if st.launch_fault != "heavy" and st.mass_need_kg <= st.mass_limit_kg:
		wins.append("The satellite is light enough for the rocket.")
	# Space junk
	if st.debris_loss:
		mistakes.append({"who": "Jabu", "title": "Space junk hit the satellite.", "why": "It had no thrusters, so it could not move out of the way.", "fix": "Add small thrusters."})
	elif st.quarters.any(func(q): return q.event == "EV5"):
		wins.append("The thrusters dodged the space junk." if st.thrusters else "Lucky! The space junk missed us.")
	return {"wins": wins, "mistakes": mistakes}
