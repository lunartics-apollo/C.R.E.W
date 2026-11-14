extends Control
## One accessible overlay for department decisions, Core puzzles and reports.
signal finished(result: Dictionary)
signal address_requested

const UI := preload("res://scripts/preflight.gd")
const WHITE := Color("#fff4dc")
const GOLD := Color("#f0c68c")
const MUTED := Color("#94b7b1")
var mission: ForestMission
var activity_id := ""
var kind := "decision"
var definition: Dictionary = {}
var report_data: Dictionary = {}
var heading: Label
var subtitle: Label
var gauges: Label
var message: Label
var hint: Label
var body: Control
var slider: HSlider
var continue_button: Button
var puzzle_type := ""
var puzzle_score := -1.0
var toggles: Array[bool] = []
var attempts := 0
var elapsed := 0.0
var accurate := 0.0
var hits := 0
var debris: Array[Dictionary] = []
var next_debris := 0.0
var checked := 0
var checklist_buttons: Array[Button] = []
var report_closing := false
var sequence_step := 0
var result_feedback := ""

func setup(progress: ForestMission, id: String) -> void:
	mission = progress
	activity_id = id
	definition = ForestMission.definition(id)
	attempts = int(progress.state.attempts.get(id, 0))

func setup_checklist(progress: ForestMission) -> void:
	mission = progress
	kind = "checklist"

func setup_report(progress: ForestMission, data: Dictionary) -> void:
	mission = progress
	kind = "report"
	report_data = data

func _ready() -> void:
	name = "MissionActivity"
	size = Vector2(480, 270)
	theme = PixelFont.theme()
	mouse_filter = Control.MOUSE_FILTER_STOP
	heading = label("BORNEO FOREST WATCH", Vector2(16, 9), 448, 14, WHITE)
	subtitle = label("", Vector2(16, 33), 448, 9, GOLD)
	gauges = label(mission.summary(), Vector2(16, 51), 448, 8, MUTED)
	hint = label("", Vector2(16, 249), 448, 8, MUTED)
	if kind == "checklist":
		show_checklist()
	elif kind == "report":
		show_report()
	else:
		show_choices()

func label(text: String, at: Vector2, width: float, font_size := 9, color := WHITE, parent: Node = null) -> Label:
	return UI.label_at(self if parent == null else parent, text, at, width, font_size, color)

func button(node_name: String, text: String, rect: Rect2, action: Callable) -> Button:
	return UI.button_at(body, node_name, text, rect, action)

func clear_body(node_name := "Activity") -> void:
	if is_instance_valid(body):
		remove_child(body)
		body.queue_free()
	body = Control.new()
	body.name = node_name
	body.size = size
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(body)
	slider = null
	continue_button = null
	message = null

func show_choices() -> void:
	kind = "decision"
	clear_body("Choices")
	subtitle.text = "%s / %s" % [activity_id, definition.get("title", "MISSION DECISION")]
	label(str(definition.get("npc", "Director Aisyah")) + ": " + definition.get("prompt", "Choose together."), Vector2(16, 73), 448, 9, WHITE, body)
	var choices: Array = definition.get("choices", [])
	for i in choices.size():
		var option: Dictionary = choices[i]
		var b := button("Option%d" % i, "", Rect2(16, 109 + i * 42, 448, 38), choose_option.bind(i))
		UI.label_at(b, "%d  %s" % [i + 1, option.label], Vector2(8, 4), 430, 9, GOLD)
		UI.label_at(b, option.get("detail", ""), Vector2(8, 18), 430, 8, WHITE)
		b.tooltip_text = option.get("detail", "")
		if i == 0:
			b.grab_focus()
	hint.text = "1-3 or click: choose. Every choice changes your mission."

func choose_option(index: int) -> void:
	var result := mission.choose(activity_id, index)
	if not result.get("ok", false):
		hint.text = result.get("feedback", "This option is unavailable.")
		return
	puzzle_type = definition.get("puzzle", "")
	gauges.text = mission.summary()
	if puzzle_type == "":
		finished.emit({"id": activity_id, "ok": true, "feedback": result.get("feedback", "Decision recorded.")})
	else:
		show_puzzle()

func show_puzzle() -> void:
	if mission.state.mode == "engineer" and attempts >= 2:
		finish_puzzle(float(mission.state.scores.get(activity_id, 0)))
		return
	kind = "puzzle"
	clear_body()
	puzzle_score = -1.0
	elapsed = 0.0
	accurate = 0.0
	hits = 0
	next_debris = 0.0
	sequence_step = 0
	debris.clear()
	var titles := {"rocket_fit": "ROCKET FIT", "one_orbit": "ONE ORBIT", "pass_planner": "PASS PLANNER", "payload_bay": "PAYLOAD BAY", "rain_fade": "RAIN FADE", "debris_dodge": "DEBRIS DODGE", "switch_sensors": "SWITCH SENSORS", "reroute": "REROUTE", "power_triage": "POWER TRIAGE", "reset_sequence": "RESET SEQUENCE", "cool_down": "COOL DOWN"}
	subtitle.text = "%s / %s" % [activity_id, titles.get(puzzle_type, "CALIBRATION")]
	message = label("", Vector2(16, 76), 448, 9, WHITE, body)
	if puzzle_type in ["switch_sensors", "reroute", "reset_sequence"]:
		var names: Array = ["VISIBLE", "THERMAL"] if puzzle_type == "switch_sensors" else (["STATION", "BACKUP DISH", "DATA SERVER"] if puzzle_type == "reroute" else ["1", "2", "3", "4"])
		for i in names.size():
			button("Action%d" % i, names[i], Rect2(16 + i * (448.0 / names.size()), 151, 440.0 / names.size(), 37), event_action.bind(i))
	elif puzzle_type in ["one_orbit", "pass_planner", "payload_bay", "power_triage", "cool_down"]:
		var names: Array
		match puzzle_type:
			"one_orbit", "power_triage", "cool_down":
				names = ["IMAGER 8 W", "RADIO 6 W", "HEATER 4 W", "BEACON 2 W"]
				toggles.assign([true, true, true, true])
			"pass_planner":
				names = ["PASS 1 / 18%", "PASS 2 / 30%", "PASS 3 / 25%", "PASS 4 / 16%"]
				toggles.assign([false, false, false, false])
			_:
				names = ["IMAGER 1.2 KG / 4 W", "THERMAL 1 KG / 6 W", "NIR 0.6 KG / 2 W", "RELAY 0.9 KG / 3 W"]
				toggles.assign([true, false, false, false])
		for i in names.size():
			var b := button("Toggle%d" % i, names[i], Rect2(16 + (i % 2) * 228, 139 + (i / 2) * 31, 220, 26), toggle.bind(i))
			b.toggle_mode = true
			b.button_pressed = toggles[i]
	else:
		slider = HSlider.new()
		slider.name = "Dial"
		slider.min_value = 0
		slider.max_value = 100
		slider.step = 0.1
		slider.value = 50
		if puzzle_type == "rocket_fit":
			slider.min_value = 0.5
			slider.max_value = maxf(10, float(mission.state.mass_limit_kg) * 1.5)
			slider.value = minf(slider.max_value, float(mission.state.mass_limit_kg) * 1.2)
		body.add_child(slider)
		slider.position = Vector2(24, 165 if puzzle_type not in ["rain_fade", "debris_dodge"] else 215)
		slider.size = Vector2(432, 18)
		slider.value_changed.connect(func(_value): update_puzzle())
		slider.grab_focus()
	if puzzle_type not in ["rain_fade", "debris_dodge", "switch_sensors", "reroute", "reset_sequence"]:
		continue_button = button("Submit", "CHECK SOLUTION", Rect2(16, 215, 448, 26), submit_puzzle)
	hint.text = "Drag the dial / use arrows. Check your limits."
	if mission.state.mode != "engineer":
		hint.text = definition.get("hint", "Keep every requirement green. You can retry and learn.")
	update_puzzle()
	queue_redraw()

func toggle(index: int) -> void:
	toggles[index] = not toggles[index]
	update_puzzle()

func update_puzzle() -> void:
	if not is_instance_valid(message):
		return
	match puzzle_type:
		"rocket_fit":
			message.text = "Keep the required payload. Fit the rocket's mass limit.\nPAYLOAD %.2f kg / REQUIRED %.2f kg / LIMIT %.2f kg" % [slider.value, mission.state.mass_kg, mission.state.mass_limit_kg]
			message.modulate = WHITE if slider.value >= float(mission.state.mass_kg) and slider.value <= float(mission.state.mass_limit_kg) else Color("#ef9d83")
		"one_orbit", "power_triage", "cool_down":
			var watts := eclipse_load()
			var minutes := 55.0 if puzzle_type == "power_triage" else 35.0
			message.text = "%s\nLOAD %.0f W / ECLIPSE %.1f Wh / USABLE %.1f Wh" % ["Switch off heavy loads to keep the battery cool." if puzzle_type == "cool_down" else ("%.0f minutes in shadow. Keep heater and beacon on." % minutes), watts, watts * minutes / 60.0, float(mission.state.battery_wh) * 0.6]
		"pass_planner":
			message.text = "Book up to 3 passes. Return at least 70%% of the data.\nRETURN %d%% / PASSES %d of 3 / TANK %d%% of 60%%" % [pass_data(), toggles.count(true), 110 - pass_data()]
		"payload_bay":
			var values := payload_load()
			message.text = "Keep the imager. Pack useful sensors within both limits.\nMASS %.1f / 2.8 kg / POWER %.0f / 10 W" % [values.x, values.y]
		"rain_fade":
			message.text = "Rain is coming. Keep the needle near the green marker.\nTIME %.0f / 12 s / SIGNAL LOCK %d%%" % [minf(elapsed, 12), int(accurate / maxf(0.01, elapsed - 2) * 100)]
		"debris_dodge":
			message.text = "Move left / right to dodge debris for 20 seconds.\nTIME %.0f / 20 s / HITS %d" % [minf(elapsed, 20), hits]
		"switch_sensors":
			message.text = "Cloud is hiding the forest. Switch to thermal before 8 seconds.\nCLOUD BAR %d%%" % int(minf(100, elapsed / 8 * 100))
		"reroute":
			message.text = "Link STATION > BACKUP DISH > DATA SERVER before the pass ends.\nLINKS %d / 3 / TIME LEFT %.0f s" % [sequence_step, maxf(0, 12 - elapsed)]
		"reset_sequence":
			message.text = "Watch the reset sequence: 1 > 3 > 2 > 4" if elapsed < 3 else "Repeat the sequence. Step %d / 4." % (sequence_step + 1)
		_:
			message.text = "Tune the dial into the green window: 45 to 55."
	queue_redraw()

func eclipse_load() -> float:
	var watts := 6.0
	for i in 4:
		if toggles[i]:
			watts += [8, 6, 4, 2][i]
	return watts

func pass_data() -> int:
	var data := 0
	for i in 4:
		if toggles[i]:
			data += [18, 30, 25, 16][i]
	return data

func payload_load() -> Vector2:
	var values := Vector2.ZERO
	for i in 4:
		if toggles[i]:
			values += [Vector2(1.2, 4), Vector2(1, 6), Vector2(0.6, 2), Vector2(0.9, 3)][i]
	return values

func submit_puzzle() -> void:
	var score := 100.0
	match puzzle_type:
		"rocket_fit":
			score = 100 if slider.value >= float(mission.state.mass_kg) and slider.value <= float(mission.state.mass_limit_kg) else 35
		"one_orbit", "power_triage", "cool_down":
			var minutes := 55.0 if puzzle_type == "power_triage" else 35.0
			score = 100 if toggles[2] and toggles[3] and eclipse_load() * minutes / 60.0 <= float(mission.state.battery_wh) * 0.6 else 30
		"pass_planner":
			score = 100 if pass_data() >= 70 and toggles.count(true) <= 3 and 110 - pass_data() <= 60 else 40
		"payload_bay":
			var values := payload_load()
			score = (100 if toggles.count(true) >= 2 else 70) if toggles[0] and values.x <= 2.8 and values.y <= 10 else 25
		_:
			score = 100 if slider.value >= 45 and slider.value <= 55 else 40
	finish_puzzle(score)

func finish_puzzle(score: float) -> void:
	if puzzle_score >= 0:
		return
	puzzle_score = clampf(score, 0, 100)
	if mission.state.mode != "engineer" or int(mission.state.attempts.get(activity_id, 0)) < 2:
		var result := mission.puzzle_result(activity_id, puzzle_score)
		if not result.get("ok", false):
			puzzle_score = -1
			hint.text = result.get("feedback", "Could not record this result.")
			return
		result_feedback = result.get("feedback", "Result recorded.")
	else:
		puzzle_score = float(mission.state.scores.get(activity_id, 0))
		result_feedback = "Engineer attempt limit reached. Existing result kept."
	attempts = int(mission.state.attempts.get(activity_id, 0))
	kind = "result"
	clear_body()
	var tier := "GOLD" if score >= 80 else ("SILVER" if score >= 50 else "BRONZE")
	label("%s / %d POINTS" % [tier, int(puzzle_score)], Vector2(16, 88), 448, 14, GOLD, body)
	label("Your result affects mission risk. Mistakes teach us.\nCadet: retries and hints. Engineer: one retry.", Vector2(16, 123), 448, 9, WHITE, body)
	button("Accept", "ACCEPT RESULT", Rect2(244, 205, 220, 32), accept_result).grab_focus()
	if mission.state.mode != "engineer" or attempts < 2:
		button("Retry", "TRY AGAIN", Rect2(16, 205, 220, 32), show_puzzle)
	hint.text = "Gold 80+ / Silver 50-79 / Bronze under 50."
	queue_redraw()

func accept_result() -> void:
	finished.emit({"id": activity_id, "ok": true, "score": puzzle_score, "feedback": result_feedback})

func event_action(index: int) -> void:
	if kind != "puzzle":
		return
	match puzzle_type:
		"switch_sensors":
			finish_puzzle(100 if index == 1 and elapsed < 8 else 30)
		"reroute":
			if index == sequence_step:
				sequence_step += 1
			else:
				hits += 1
			if sequence_step == 3:
				finish_puzzle(maxf(0, 100 - hits * 20))
		"reset_sequence":
			if elapsed < 3:
				return
			if index == [0, 2, 1, 3][sequence_step]:
				sequence_step += 1
			else:
				hits += 1
			if sequence_step == 4:
				finish_puzzle(maxf(0, 100 - hits * 25))
	update_puzzle()

func show_checklist() -> void:
	clear_body()
	subtitle.text = "T-MINUS / COUNTDOWN CHECKLIST"
	message = label("Confirm all eight items in order. Amber means close to a limit.", Vector2(16, 77), 448, 9, WHITE, body)
	var names := ["POWER", "BATTERY", "ANTENNA", "INSTRUMENTS", "MASS", "ORBIT", "BUDGET", "SCHEDULE"]
	for i in names.size():
		var b := button("Check%d" % i, "%d  %s" % [i + 1, names[i]], Rect2(16 + (i % 2) * 228, 108 + (i / 2) * 25, 220, 22), check_item.bind(i))
		checklist_buttons.append(b)
	continue_button = button("Continue", "ALL ROLES GO / LAUNCH", Rect2(16, 216, 448, 26), func(): finished.emit({"id": "checklist", "ok": true}))
	continue_button.disabled = true
	checklist_buttons[0].grab_focus()
	hint.text = "Reliability gives odds. A launch can fail even with a good design."

func check_item(index: int) -> void:
	if index != checked:
		message.text = "Check item %d first. One step at a time." % (checked + 1)
		return
	checklist_buttons[index].disabled = true
	checked += 1
	message.text = "%d / 8 confirmed. All green before launch." % checked
	continue_button.disabled = checked < 8
	if checked < 8:
		checklist_buttons[checked].grab_focus()
	else:
		continue_button.grab_focus()

func show_report() -> void:
	clear_body()
	subtitle.text = "%s / %s" % [report_data.ending, report_data.headline]
	gauges.text = "%s / SCORE %d / SARAWAK'S SKY IS WAITING" % [report_data.grade, int(report_data.score)]
	var scroll := ScrollContainer.new()
	scroll.position = Vector2(16, 76)
	scroll.size = Vector2(448, 154)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 7)
	scroll.add_child(column)
	report_line(column, "MINISTER HAMDAN: " + report_data.get("speech", "Our forests are our future."), GOLD)
	for requirement in report_data.get("requirements", []):
		report_line(column, ("PASS " if requirement.met else "CHECK ") + requirement.label + ": " + str(requirement.value), MUTED if requirement.met else Color("#ef9d83"))
	report_line(column, "WHY IT HAPPENED", GOLD)
	for entry in report_data.get("log", []):
		report_line(column, str(entry), WHITE)
	if report_data.has("role_scorecards"):
		for role in report_data.role_scorecards:
			report_line(column, role.to_upper() + " SCORECARD", GOLD)
			for entry in report_data.role_scorecards[role]:
				report_line(column, "%s / %s / %s" % [entry.id, entry.decision, entry.tier], MUTED)
	if report_data.has("breakdown"):
		var b: Dictionary = report_data.breakdown
		report_line(column, "SCORE: Objective %.0f/40 / Science %.0f/20 / Efficiency %.0f/15 / Teamwork %.0f/15 / Budget %.0f/10" % [b.objective, b.science, b.efficiency, b.teamwork, b.budget], WHITE)
	report_line(column, "TRY NEXT: " + report_data.get("tip", "Leave room for surprises."), GOLD)
	var preview := ForestPreview.new()
	preview.custom_minimum_size = Vector2(400, 70)
	column.add_child(preview)
	report_line(column, "Illustrated forest preview / project artwork. No live satellite data.", MUTED)
	button("ReplayAddress", "WATCH ADDRESS", Rect2(16, 236, 170, 28), func(): address_requested.emit())
	button("CloseReport", "MISSION SELECT", Rect2(194, 236, 270, 28), close_report).grab_focus()
	hint.hide()

func report_line(parent: Node, text: String, color: Color) -> void:
	var readable := text.replace("≥", ">=").replace("≤", "<=").replace("·", "/").replace("–", "-")
	var line := UI.label_at(parent, readable, Vector2.ZERO, 416, 9, color)
	line.custom_minimum_size.x = 416
	line.size_flags_horizontal = Control.SIZE_EXPAND_FILL

func close_report() -> void:
	if report_closing:
		return
	report_closing = true
	finished.emit({"id": "report", "close": true})

func _process(delta: float) -> void:
	if kind != "puzzle":
		return
	elapsed += delta
	if puzzle_type in ["switch_sensors", "reroute", "reset_sequence"]:
		if (puzzle_type == "switch_sensors" and elapsed >= 8) or (puzzle_type == "reroute" and elapsed >= 12) or (puzzle_type == "reset_sequence" and elapsed >= 30):
			finish_puzzle(25)
		else:
			update_puzzle()
		return
	if puzzle_type not in ["rain_fade", "debris_dodge"]:
		return
	var direction := float(Input.is_key_pressed(KEY_RIGHT) or Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_LEFT) or Input.is_key_pressed(KEY_A))
	if direction != 0:
		slider.value += direction * 65 * delta
	if puzzle_type == "rain_fade":
		var target := 50 + sin(elapsed * 1.1) * 23
		if elapsed > 2 and absf(slider.value - target) < 11:
			accurate += delta
		if elapsed >= 12:
			finish_puzzle(accurate / maxf(0.01, elapsed - 2) * 100)
	else:
		if elapsed >= next_debris:
			debris.append({"x": 30.0 + fmod(next_debris * 117.0 + 19, 420), "y": 110.0, "hit": false})
			next_debris += 1.15
		for rock in debris:
			rock.y += delta * 62
			if not rock.hit and absf(rock.y - 198) < 8 and absf(rock.x - (24 + slider.value * 4.32)) < 12:
				rock.hit = true
				hits += 1
		debris = debris.filter(func(rock): return rock.y < 213)
		if elapsed >= 20:
			finish_puzzle(maxf(0, 100 - hits * 18))
	if kind == "puzzle":
		update_puzzle()

func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and kind == "decision":
		if event.keycode >= KEY_1 and event.keycode <= KEY_3:
			var index: int = event.keycode - KEY_1
			if index < definition.get("choices", []).size():
				choose_option(index)
				get_viewport().set_input_as_handled()

func _draw() -> void:
	draw_rect(Rect2(0, 0, 480, 270), Color("#102532"))
	draw_line(Vector2(16, 68), Vector2(464, 68), Color("#3c5d62"))
	if kind != "puzzle":
		return
	if puzzle_type == "rocket_fit" and is_instance_valid(slider):
		var span := maxf(0.01, slider.max_value - slider.min_value)
		var low := clampf((float(mission.state.mass_kg) - slider.min_value) / span, 0, 1)
		var high := clampf((float(mission.state.mass_limit_kg) - slider.min_value) / span, 0, 1)
		draw_rect(Rect2(24, 139, 432, 12), Color("#5a3c36"))
		if high > low:
			draw_rect(Rect2(24 + low * 432, 139, (high - low) * 432, 12), Color("#406957"))
		var needle := 24 + (slider.value - slider.min_value) / span * 432
		draw_line(Vector2(needle, 136), Vector2(needle, 154), GOLD, 2)
	elif puzzle_type == "rain_fade":
		draw_rect(Rect2(24, 138, 432, 53), Color("#193845"))
		var target := 24 + (50 + sin(elapsed * 1.1) * 23) * 4.32
		draw_rect(Rect2(target - 44, 143, 88, 43), Color("#406957"))
		draw_line(Vector2(24 + slider.value * 4.32, 138), Vector2(24 + slider.value * 4.32, 191), GOLD, 3)
	elif puzzle_type == "debris_dodge":
		draw_rect(Rect2(24, 110, 432, 100), Color("#091d30"))
		for rock in debris:
			draw_circle(Vector2(rock.x, rock.y), 4, Color("#8a7464") if not rock.hit else Color("#e8843e"))
		var ship := Vector2(24 + slider.value * 4.32, 198)
		draw_colored_polygon(PackedVector2Array([ship + Vector2(0, -9), ship + Vector2(-7, 5), ship + Vector2(7, 5)]), WHITE)

class ForestPreview extends Control:
	func _draw() -> void:
		draw_rect(Rect2(0, 0, 416, 70), Color("#2b5c48"))
		for i in 180:
			var at := Vector2((i * 47) % 416, (i * 31) % 70)
			draw_circle(at, 2 + i % 3, [Color("#3d7953"), Color("#4d8a56"), Color("#275540")][i % 3])
		draw_polyline(PackedVector2Array([Vector2(50, 0), Vector2(110, 17), Vector2(203, 24), Vector2(260, 51), Vector2(356, 70)]), Color("#8cb9b5"), 7)
