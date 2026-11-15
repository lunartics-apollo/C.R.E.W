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
var gauges: RichTextLabel
var risk_tag: Label
var option_buttons: Array[Button] = []
var option_cursors: Array[Label] = []
var hover_option := -1
var blink := 0.0
const RED_TEXT := "#ff8f70"
const AMBER_TEXT := "#f0c68c"
const CALM_TEXT := "#94b7b1"
const GOOD_TEXT := "#9fd6a5"
const RISK_NAMES := ["CAMERA", "SARAWAK", "PHOTOS", "LIFE", "BUDGET", "WEIGHT", "TIME", "POWER", "BATTERY"]
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
	gauges = RichTextLabel.new()
	gauges.name = "Gauges"
	gauges.position = Vector2(16, 51)
	gauges.size = Vector2(448, 13)
	gauges.bbcode_enabled = true
	gauges.scroll_active = false
	gauges.autowrap_mode = TextServer.AUTOWRAP_OFF
	gauges.mouse_filter = Control.MOUSE_FILTER_IGNORE
	gauges.add_theme_font_size_override("normal_font_size", 8)
	gauges.add_theme_color_override("default_color", MUTED)
	add_child(gauges)
	_refresh_gauges()
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
	option_buttons.clear()
	option_cursors.clear()
	hover_option = -1
	subtitle.text = ""
	_build_pills()
	risk_tag = Label.new()
	risk_tag.name = "RiskTag"
	risk_tag.position = Vector2(236, 34)
	risk_tag.size = Vector2(228, 12)
	risk_tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	risk_tag.add_theme_font_size_override("font_size", 8)
	risk_tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(risk_tag)
	# The department lead's face sits in a thin frame beside their line, so the player sees who is asking.
	var speaker_id: String = str(definition.get("owner", "nova"))
	if speaker_id == "team" or CrewRoster.index_of(speaker_id) < 0:
		speaker_id = "nova"
	var frame := Panel.new()
	frame.name = "LeadFrame"
	frame.position = Vector2(15, 71)
	frame.size = Vector2(30, 30)
	var frame_style := StyleBoxFlat.new()
	frame_style.bg_color = Color("#0b1a24")
	frame_style.border_color = GOLD
	frame_style.set_border_width_all(1)
	frame.add_theme_stylebox_override("panel", frame_style)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(frame)
	var face := TextureRect.new()
	face.name = "LeadFace"
	face.texture = load(CrewRoster.portrait_path(speaker_id))
	face.position = Vector2(16, 72)
	face.size = Vector2(28, 28)
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(face)
	var name_label := label(str(definition.get("npc", "Director Aisyah")).to_upper(), Vector2(52, 70), 412, 8, GOLD, body)
	name_label.name = "LeadName"
	var prompt_label := label(str(definition.get("prompt", "Choose together.")), Vector2(52, 81), 412, 9, WHITE, body)
	prompt_label.name = "Prompt"
	var choices: Array = definition.get("choices", [])
	# Share the space between the prompt and the hint line so four options still fit.
	var slot := minf(42.0, 138.0 / maxf(1.0, choices.size()))
	for i in choices.size():
		var option: Dictionary = choices[i]
		var b := button("Option%d" % i, "", Rect2(16, 107 + i * slot, 448, slot - 4), choose_option.bind(i))
		var cursor := UI.label_at(b, ">", Vector2(3, 3), 10, 9, GOLD)
		cursor.visible = false
		cursor.name = "Cursor"
		var title := UI.label_at(b, "%d  %s" % [i + 1, option.label], Vector2(13, 3), 190, 9, GOLD)
		var detail := UI.label_at(b, option.get("detail", ""), Vector2(8, 16), 430, 8, WHITE)
		# One line each: nothing may spill outside its box.
		for line in [title, detail]:
			line.autowrap_mode = TextServer.AUTOWRAP_OFF
			line.clip_text = true
			line.custom_minimum_size.y = 0
		# Colour-coded stat changes on the right of the title row: what this option does to the gauges.
		var badges := RichTextLabel.new()
		badges.name = "Badges"
		badges.position = Vector2(200, 2)
		badges.size = Vector2(244, 12)
		badges.bbcode_enabled = true
		badges.scroll_active = false
		badges.autowrap_mode = TextServer.AUTOWRAP_OFF
		badges.mouse_filter = Control.MOUSE_FILTER_IGNORE
		badges.add_theme_font_size_override("normal_font_size", 8)
		badges.text = "[right]%s[/right]" % _badge_text(i)
		b.add_child(badges)
		b.tooltip_text = option.get("detail", "")
		b.mouse_entered.connect(func():
			hover_option = i
			_update_preview())
		b.mouse_exited.connect(func():
			if hover_option == i:
				hover_option = -1
			_update_preview())
		b.focus_entered.connect(_update_preview)
		b.focus_exited.connect(_update_preview)
		option_buttons.append(b)
		option_cursors.append(cursor)
		if i == 0:
			b.grab_focus()
	var clue := str(definition.get("clue", ""))
	hint.text = ("CLUE: " + clue) if clue != "" else "1-%d or click: choose. Every choice changes your mission." % choices.size()
	_update_preview()

## Three small tags: the card's ID, its name and the phase of the mission it belongs to.
func _build_pills() -> void:
	var row := HBoxContainer.new()
	row.name = "Pills"
	row.position = Vector2(16, 31)
	row.add_theme_constant_override("separation", 4)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	body.add_child(row)
	var phase := "DESIGN"
	if definition.has("quarter"):
		phase = "OPERATIONS Q%d" % int(definition.quarter)
	elif activity_id == "P5":
		phase = "LAUNCH"
	elif activity_id.begins_with("R") or activity_id == "P4":
		phase = "REVIEW"
	row.add_child(_pill(activity_id, Color(GOLD), Color("#102532"), Color(GOLD)))
	row.add_child(_pill(str(definition.get("title", "DECISION")).to_upper(), Color("#1c3a47"), Color(WHITE), Color("#4f7d83")))
	row.add_child(_pill(phase, Color("#2f6f6a"), Color("#e6fff4"), Color("#4fa59b")))

func _pill(text: String, fill: Color, ink: Color, edge: Color) -> PanelContainer:
	var pill := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	style.content_margin_left = 4
	style.content_margin_right = 4
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	pill.add_theme_stylebox_override("panel", style)
	pill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var tag := Label.new()
	tag.text = text
	tag.add_theme_font_size_override("font_size", 8)
	tag.add_theme_color_override("font_color", ink)
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	pill.add_child(tag)
	return pill

# ---- live previews: what would this option do to the gauges? ----
func _preview_mission(index: int) -> ForestMission:
	var saved: Dictionary = mission.state.duplicate(true)
	saved.choices[activity_id] = index
	return ForestMission.new(saved)

func _badge_text(index: int) -> String:
	var now: Dictionary = mission.state
	var then: Dictionary = _preview_mission(index).state
	# [label format, change, true when going up is bad]
	var changes := [
		["%+.2fM", (float(then.cost_m) + float(then.reserve_m)) - (float(now.cost_m) + float(now.reserve_m)), true, 0.005],
		["%+.1fkg", float(then.mass_kg) - float(now.mass_kg), true, 0.05],
		["%+.1fW", float(then.power_w) - float(now.power_w), true, 0.05],
		["%+.0f%%data", float(then.data_pct) - float(now.data_pct), false, 0.5],
		["%+.1fyr", float(then.life_years) - float(now.life_years), false, 0.05],
		["%+.0fmo", float(then.months) - float(now.months), true, 0.5],
		["%+.0fW sun", float(then.solar_w) - float(now.solar_w), false, 0.5],
		["%+.0fWh", float(then.battery_wh) - float(now.battery_wh), false, 0.5],
	]
	var parts: Array[String] = []
	for change in changes:
		var amount: float = change[1]
		if absf(amount) < float(change[3]) or parts.size() >= 4:
			continue
		var worse: bool = (amount > 0) == bool(change[2])
		parts.append("[color=%s]%s[/color]" % [AMBER_TEXT if worse else GOOD_TEXT, change[0] % amount])
	return "  ".join(parts) if not parts.is_empty() else "[color=%s]no change[/color]" % CALM_TEXT

func gauge_text(st: Dictionary, base: Dictionary = {}) -> String:
	var money: float = float(st.cost_m) + float(st.reserve_m)
	var night: float = float(st.usable_wh) / ForestMission.ECLIPSE_H
	var solar_need: float = float(st.power_w) * ForestMission.RECHARGE_FACTOR
	var entries := [
		["COST %.2f/2.5M" % money, 2 if money > 2.5 else (1 if money >= 2.0 else 0), "cost_m"],
		["MASS %.1f/%.0fkg" % [st.mass_kg, st.mass_limit_kg], 2 if float(st.mass_need_kg) > float(st.mass_limit_kg) else (1 if float(st.mass_need_kg) >= 0.8 * float(st.mass_limit_kg) else 0), "mass_kg"],
		["POWER %.0f/%.0fW" % [st.power_w, st.solar_w], 2 if solar_need > float(st.solar_w) else (1 if solar_need >= 0.8 * float(st.solar_w) else 0), "power_w"],
		["BATT %.0fWh" % st.battery_wh, 2 if night < float(st.power_w) else (1 if night < 1.25 * float(st.power_w) else 0), "battery_wh"],
		["|", -1, ""],
		["DATA %.0f%%" % st.data_pct, 2 if float(st.data_pct) < 70 else (1 if float(st.data_pct) < 85 else 0), "data_pct"],
		["LIFE %.0fy" % st.life_years, 2 if float(st.life_years) < 2 else (1 if float(st.life_years) < 3 else 0), "life_years"],
		["TIME %.0f/24" % st.months, 2 if float(st.months) > 24 else (1 if float(st.months) >= 21 else 0), "months"],
	]
	var out: Array[String] = []
	for entry in entries:
		if entry[1] < 0:
			out.append("[color=#4b6b70]|[/color]")
			continue
		var color: String = [CALM_TEXT, AMBER_TEXT, RED_TEXT][entry[1]]
		var text: String = entry[0]
		if not base.is_empty() and absf(float(st.get(entry[2], 0)) - float(base.get(entry[2], 0))) > 0.04:
			text = "[u]%s[/u]" % text
		out.append("[color=%s]%s[/color]" % [color, text])
	return " ".join(out)

func _refresh_gauges() -> void:
	if is_instance_valid(gauges):
		gauges.text = gauge_text(mission.state)

func _failing(m: ForestMission) -> Array:
	var failing := []
	var list := m.requirements()
	for i in list.size():
		if not list[i].met:
			failing.append(i)
	return failing

func _update_preview() -> void:
	if kind != "decision" or not is_instance_valid(risk_tag):
		return
	var index := hover_option
	if index < 0:
		var focused := get_viewport().gui_get_focus_owner() if is_inside_tree() else null
		index = option_buttons.find(focused) if focused is Button else -1
	for i in option_cursors.size():
		option_cursors[i].visible = i == index
	if index < 0:
		_refresh_gauges()
		risk_tag.text = ""
		return
	var preview := _preview_mission(index)
	gauges.text = gauge_text(preview.state, mission.state)
	var before := _failing(mission)
	var after := _failing(preview)
	var added: Array[String] = []
	var fixed: Array[String] = []
	for item in after:
		if not before.has(item):
			added.append(RISK_NAMES[item])
	for item in before:
		if not after.has(item):
			fixed.append(RISK_NAMES[item])
	if not added.is_empty():
		risk_tag.text = "! OPTION %d RISK: %s" % [index + 1, ", ".join(added)]
		risk_tag.add_theme_color_override("font_color", Color(RED_TEXT))
	elif not fixed.is_empty():
		risk_tag.text = "OPTION %d FIXES: %s" % [index + 1, ", ".join(fixed)]
		risk_tag.add_theme_color_override("font_color", Color(GOOD_TEXT))
	else:
		risk_tag.text = "OPTION %d: NO NEW RISK" % (index + 1)
		risk_tag.add_theme_color_override("font_color", Color(CALM_TEXT))

func choose_option(index: int) -> void:
	var result := mission.choose(activity_id, index)
	if not result.get("ok", false):
		hint.text = result.get("feedback", "This option is unavailable.")
		return
	puzzle_type = definition.get("puzzle", "")
	_refresh_gauges()
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
				var watts := load_values()
				names = ["INSTRUMENTS %.0f W" % watts[0], "RADIO %.0f W" % watts[1], "HEATER 3 W", "BEACON 1 W"]
				toggles.assign([true, true, true, true])
			"pass_planner":
				names = ["PASS 1 / %d%%" % int(PASS_SHARE[0] * 100), "PASS 2 / %d%%" % int(PASS_SHARE[1] * 100), "PASS 3 / %d%%" % int(PASS_SHARE[2] * 100), "PASS 4 / %d%%" % int(PASS_SHARE[3] * 100)]
				toggles.assign([false, false, false, false])
			_:
				names = ["IMAGER 2.5 KG / 10 W", "THERMAL 1.2 KG / 6 W", "HI-RES 3 KG / 7 W", "GNSS 0.1 KG / 1 W"]
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
			message.text = "Slide into the GREEN zone: our weight plus %.0f%% spare, under the rocket limit.\nYOUR PICK %.2f kg / WE NEED %.2f kg / LIMIT %.2f kg" % [mission.state.margin_pct, slider.value, mission.state.mass_need_kg, mission.state.mass_limit_kg]
			message.modulate = WHITE if slider.value >= float(mission.state.mass_need_kg) and slider.value <= float(mission.state.mass_limit_kg) else Color("#ef9d83")
		"one_orbit", "power_triage", "cool_down":
			var watts := eclipse_load()
			var minutes := 55.0 if puzzle_type == "power_triage" else 35.0
			message.text = "%s\nPOWER USED %.0f W / NIGHT NEEDS %.1f Wh / BATTERY GIVES %.1f Wh" % ["Turn off big loads so the battery stays cool." if puzzle_type == "cool_down" else ("%.0f minutes of night. Keep the heater and beacon on." % minutes), watts, watts * minutes / 60.0, float(mission.state.usable_wh)]
		"pass_planner":
			message.text = "Pick up to 3 passes. Send at least 70%% of the photos home.\nSENT %d%% / PASSES %d of 3 / PHOTOS WAITING %d%% (MAX 30%%)" % [pass_data(), toggles.count(true), 100 - pass_data()]
		"payload_bay":
			var values := payload_load()
			var limits := payload_limits()
			message.text = "Keep the main camera. Add tools only if there is room.\nWEIGHT %.1f of %.1f kg FREE / POWER %.1f of %.1f W FREE" % [values.x, limits.x, values.y, limits.y]
		"rain_fade":
			message.text = "Rain is coming! Keep the needle inside the green box.\nTIME %.0f / 12 s / SIGNAL %d%%" % [minf(elapsed, 12), int(accurate / maxf(0.01, elapsed - 2) * 100)]
		"debris_dodge":
			message.text = "Move left and right to dodge the rocks for 20 seconds.\nTIME %.0f / 20 s / HITS %d" % [minf(elapsed, 20), hits]
		"switch_sensors":
			message.text = "Clouds are hiding the forest! Press THERMAL before the bar is full.\nCLOUD BAR %d%%" % int(minf(100, elapsed / 8 * 100))
		"reroute":
			message.text = "Press the buttons in order: STATION, BACKUP DISH, DATA SERVER.\nSTEPS DONE %d / 3 / TIME LEFT %.0f s" % [sequence_step, maxf(0, 12 - elapsed)]
		"reset_sequence":
			message.text = "Watch the pattern: 1, then 3, then 2, then 4. Remember it!" if elapsed < 3 else "Now repeat the pattern. Press button number %d of 4." % (sequence_step + 1)
		_:
			message.text = "Tune the dial into the green window: 45 to 55."
	queue_redraw()

# Share of the day's contact time carried by each pass.
const PASS_SHARE := [0.28, 0.30, 0.22, 0.20]
const PAYLOAD_KG := [2.5, 1.2, 3.0, 0.1]
const PAYLOAD_W := [10.0, 6.0, 7.0, 1.0]

func load_values() -> Array:
	# Instruments, radio while transmitting, heater and beacon.
	return [float(mission.state.instr_w), float(mission.state.radio_w), 3.0, 1.0]

func eclipse_load() -> float:
	var watts := ForestMission.BUS_LOAD_W
	var values := load_values()
	for i in 4:
		if toggles[i]:
			watts += values[i]
	return watts

func pass_data() -> int:
	var share := 0.0
	for i in 4:
		if toggles[i]:
			share += PASS_SHARE[i]
	var generated: float = mission.state.generated_gb
	if generated <= 0:
		return 100
	# Data sent per day = Mbps x contact minutes x 60 / 8000.
	return int(minf(100.0, float(mission.state.sent_gb) * share / generated * 100.0))

func payload_load() -> Vector2:
	var values := Vector2.ZERO
	for i in 4:
		if toggles[i]:
			values += Vector2(PAYLOAD_KG[i], PAYLOAD_W[i])
	return values

func payload_limits() -> Vector2:
	# Mass and power the other departments can support for instruments.
	var st: Dictionary = mission.state
	var free_mass: float = float(st.mass_limit_kg) / (1.0 + float(st.margin_pct) / 100.0) - float(st.mass_other_kg)
	var power_cap: float = minf(float(st.solar_w) / ForestMission.RECHARGE_FACTOR, float(st.usable_wh) / ForestMission.ECLIPSE_H)
	return Vector2(free_mass, power_cap - (ForestMission.BUS_LOAD_W + float(st.sys_w) + float(st.radio_avg_w)))

func submit_puzzle() -> void:
	var score := 100.0
	match puzzle_type:
		"rocket_fit":
			score = 100 if slider.value >= float(mission.state.mass_need_kg) and slider.value <= float(mission.state.mass_limit_kg) else 35
		"one_orbit", "power_triage", "cool_down":
			var minutes := 55.0 if puzzle_type == "power_triage" else 35.0
			score = 100 if toggles[2] and toggles[3] and eclipse_load() * minutes / 60.0 <= float(mission.state.usable_wh) else 30
		"pass_planner":
			score = 100 if pass_data() >= 70 and toggles.count(true) <= 3 and 100 - pass_data() <= 30 else 40
		"payload_bay":
			var values := payload_load()
			var limits := payload_limits()
			score = (100 if toggles.count(true) >= 2 else 70) if toggles[0] and values.x <= limits.x and values.y <= limits.y else 25
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
	label("A good score makes trouble less likely later. Mistakes teach us!\nCadet: try again and get hints. Engineer: one retry only.", Vector2(16, 123), 448, 9, WHITE, body)
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
	message = label("Tap the eight checks in order, from 1 to 8. Amber means close to a limit.", Vector2(16, 77), 448, 9, WHITE, body)
	var names := ["POWER", "BATTERY", "ANTENNA", "INSTRUMENTS", "MASS", "ORBIT", "BUDGET", "SCHEDULE"]
	for i in names.size():
		var b := button("Check%d" % i, "%d  %s" % [i + 1, names[i]], Rect2(16 + (i % 2) * 228, 108 + (i / 2) * 25, 220, 22), check_item.bind(i))
		checklist_buttons.append(b)
	continue_button = button("Continue", "ALL ROLES GO / LAUNCH", Rect2(16, 216, 448, 26), func(): finished.emit({"id": "checklist", "ok": true}))
	continue_button.disabled = true
	checklist_buttons[0].grab_focus()
	hint.text = "Reliability is our chance of a good launch. Even a good design can fail."

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
	column.add_theme_constant_override("separation", 5)
	scroll.add_child(column)
	var GREEN := Color("#9fd6a5")
	var RED := Color("#ef9d83")
	report_line(column, "MINISTER HAMDAN: " + report_data.get("speech", "Our forests are our future."), GOLD)
	report_line(column, "WHAT HAPPENED", GOLD)
	report_line(column, report_data.get("story", ""), WHITE)
	report_line(column, "WHAT WENT WELL", GOLD)
	var wins: Array = report_data.get("wins", [])
	if wins.is_empty():
		report_line(column, "Not much this time. But every mistake teaches us!", MUTED)
	for win in wins:
		report_line(column, "+ " + str(win), GREEN)
	report_line(column, "WHAT WENT WRONG", GOLD)
	var mistakes: Array = report_data.get("mistakes", [])
	if mistakes.is_empty():
		report_line(column, "Nothing went wrong. Great job!", GREEN)
	for mistake in mistakes:
		report_line(column, "! %s: %s" % [mistake.who, mistake.title], RED)
		report_line(column, "Why: " + str(mistake.why), WHITE)
		report_line(column, "Try: " + str(mistake.fix), MUTED)
	if report_data.has("role_scorecards"):
		report_line(column, "HOW EACH LEAD DID", GOLD)
		for role in report_data.role_scorecards:
			var lead: String = str(role).split(" ")[0]
			var problems := 0
			for mistake in mistakes:
				problems += int(str(mistake.who).contains(lead))
			var puzzles: Array[String] = []
			for entry in report_data.role_scorecards[role]:
				if entry.tier != "Not scored":
					puzzles.append("%s %s" % [ForestMission.definition(entry.id).get("title", entry.id), entry.tier])
			var line := "%s: %s." % [role, "no problems found" if problems == 0 else ("%d problem%s to fix" % [problems, "" if problems == 1 else "s"])]
			if not puzzles.is_empty():
				line += " Puzzles: " + ", ".join(puzzles)
			report_line(column, line, MUTED if problems == 0 else WHITE)
	if report_data.has("breakdown"):
		var b: Dictionary = report_data.breakdown
		report_line(column, "YOUR SCORE", GOLD)
		report_line(column, "Goals %.0f of 40, science %.0f of 20, smart weight and power %.0f of 15, teamwork %.0f of 15, money %.0f of 10. Total %d." % [b.objective, b.science, b.efficiency, b.teamwork, b.budget, int(report_data.score)], WHITE)
	report_line(column, "TRY NEXT", GOLD)
	report_line(column, report_data.get("tip", "Leave room for surprises."), WHITE)
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
	if kind == "decision":
		blink += delta
		for cursor in option_cursors:
			cursor.modulate.a = 0.55 + 0.45 * sin(blink * 7.0)
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
		var low := clampf((float(mission.state.mass_need_kg) - slider.min_value) / span, 0, 1)
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
