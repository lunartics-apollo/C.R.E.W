extends CanvasLayer
## Compact pixel HUD on one root Control using the bitmap PixelFont (assets/ui frames).
##   top-left    : crew card (portrait, name, health/energy/food bars) + small crew strip
##   top-right   : clock, objective
##   bottom-right: zoomed minimap, collapsible with N
##   bottom      : key prompt and inventory (hidden while someone is talking)
##   overlays    : room banner, off-screen objective arrow, toasts, station map (M),
##                 help/pause screen (H), chapter cards

const UI := "res://assets/ui/"
const INK := Color("#2a2230")
const CREAM := Color("#fff4dc")
const MUTED := Color("#8a7464")
const GOLD := Color("#f2c94c")
const RED := Color("#e5604d")
const SLOTS := 6
const TYPE_SPEED := 50.0
const STAT_KEYS := ["health", "energy", "food"]
const STAT_COLORS := {"health": Color("#e2504a"), "energy": Color("#f2c94c"), "food": Color("#ec8a46")}
const BAR_W := 58.0
const STAT_BAR_W := 40.0
## Each bar is just named, with the bar beside it. When it runs low the name blinks red and says what to do.
const STAT_LABELS := {"health": "HEALTH", "energy": "ENERGY", "food": "FOOD"}
const STAT_LOW_LABELS := {"health": "SLEEP!", "energy": "COFFEE!", "food": "EAT!"}

signal help_requested
signal exit_requested
const MAP_RECT := Rect2(380, 168, 96, 84)   # minimap panel when expanded
const MAP_HEADER := 13.0

var root: Control
var card_portrait: TextureRect
var card_name: Label
var stat_fills := {}
var stat_labels := {}
var help_button: Button
var exit_button: Button
var view_banner: Label
var exit_armed := false
var crew_slots: Array[NinePatchRect] = []
var crew_health: Array[ColorRect] = []
var crew_needed: Array[TextureRect] = []
var map_panel: NinePatchRect
var map_title: Label
var minimap_view: Control
var map_expanded := true
var clock_label: Label
var period_label: Label
var objective_card: NinePatchRect
var objective_label: Label
var objective_flash := 0.0
var last_objective := ""
var inventory_panel: NinePatchRect
var inventory_slots: Array[TextureRect] = []
var prompt_box: NinePatchRect
var prompt_key: Label
var prompt_label: Label
var room_banner: NinePatchRect
var room_label: Label
var edge_arrow: Sprite2D
var dialogue_box: NinePatchRect
var dialogue_name: Label
var dialogue_text: Label
var dialogue_portrait: TextureRect
var dialogue_more: Label
var toast: HBoxContainer
var toast_icon: TextureRect
var toast_label: Label
var help: Control
var card: ColorRect
var card_title: Label
var card_sub: Label
var card_hint: Label
var minimap: Control       # the big station map (M)
var full_text := ""
var shown_chars := 0.0
var round_ui := true
var mission_gauges: Label

func _ready() -> void:
	layer = 2
	root = Control.new()
	root.name = "Root"
	root.size = Vector2(480, 270)
	root.theme = PixelFont.theme()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_crew_card()
	_build_crew_strip()
	_build_menu_buttons()
	_build_clock()
	_build_objective()
	_build_map_panel()
	_build_inventory()
	_build_prompt()
	_build_room_banner()
	_build_dialogue()
	_build_toast()
	edge_arrow = Sprite2D.new()
	edge_arrow.texture = load(UI + "arrow.png")
	edge_arrow.hide()
	add_child(edge_arrow)
	minimap = preload("res://scripts/minimap.gd").new()
	minimap.name = "Minimap"
	minimap.hide()
	root.add_child(minimap)
	_build_help()
	_build_card()
	mission_gauges = text(root, Vector2(4, 84), GOLD, 288)
	mission_gauges.add_theme_font_size_override("font_size", 8)
	mission_gauges.mouse_filter = Control.MOUSE_FILTER_IGNORE

# ── small builders ───────────────────────────────────────────────────────────
static func frame(texture: String, rect: Rect2, margin := 3) -> NinePatchRect:
	var n := NinePatchRect.new()
	n.texture = load(UI + texture)
	n.patch_margin_left = margin
	n.patch_margin_right = margin
	n.patch_margin_top = margin
	n.patch_margin_bottom = margin
	n.position = rect.position
	n.size = rect.size
	n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return n

## Pixel-font label. width > 0 wraps; big = 2x size for titles.
static func text(parent: Node, pos: Vector2, color: Color, width := 0.0, outlined := false, big := false) -> Label:
	var label := Label.new()
	if big:
		label.add_theme_font_size_override("font_size", PixelFont.SIZE * 2)
	label.add_theme_color_override("font_color", color)
	if outlined:
		label.add_theme_color_override("font_outline_color", INK)
		label.add_theme_constant_override("outline_size", 2)
	label.position = pos
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	if width > 0.0:
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		label.size = Vector2(width, 0)
	return label

static func centered(label: Label, width: float) -> Label:
	label.size.x = width
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return label

static func icon(parent: Node, path: String, pos: Vector2) -> TextureRect:
	var t := TextureRect.new()
	t.texture = load(path)
	t.position = pos
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(t)
	return t

static func bar(parent: Node, pos: Vector2, width: float, color: Color) -> ColorRect:
	var track := ColorRect.new()
	track.position = pos
	track.size = Vector2(width + 2, 5)
	track.color = INK
	track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(track)
	var fill := ColorRect.new()
	fill.position = Vector2(1, 1)
	fill.size = Vector2(width, 3)
	fill.color = color
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.add_child(fill)
	return fill

func _build_crew_card() -> void:
	var panel := frame("panel_dark.png", Rect2(4, 4, 136, 46))
	panel.name = "CrewCard"
	root.add_child(panel)
	var slot := frame("slot_selected.png", Rect2(3, 3, 32, 32))
	panel.add_child(slot)
	card_portrait = TextureRect.new()
	card_portrait.position = Vector2(2, 2)
	card_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE  # shrink below the 28px texture
	card_portrait.stretch_mode = TextureRect.STRETCH_SCALE
	card_portrait.size = Vector2(28, 28)
	slot.add_child(card_portrait)
	card_name = text(panel, Vector2(39, 2), CREAM)
	for row in STAT_KEYS.size():
		var key: String = STAT_KEYS[row]
		var y := 14.0 + row * 10.0
		icon(panel, UI + "icons/%s_s.png" % key, Vector2(38, y - 1))
		var tag := text(panel, Vector2(48, y - 3), MUTED)
		tag.add_theme_font_size_override("font_size", 8)
		tag.text = STAT_LABELS[key]
		stat_labels[key] = tag
		stat_fills[key] = bar(panel, Vector2(88, y), STAT_BAR_W, STAT_COLORS[key])

func _build_crew_strip() -> void:
	var strip := Control.new()
	strip.name = "CrewStrip"
	strip.position = Vector2(4, 54)
	strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(strip)
	for i in CrewRoster.CREW.size():
		var slot := frame("slot.png", Rect2(i * 22, 0, 20, 20))
		slot.clip_contents = true
		strip.add_child(slot)
		var portrait := TextureRect.new()
		portrait.texture = load(CrewRoster.icon_path(CrewRoster.CREW[i].id))
		portrait.position = Vector2(2, 2)
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE  # shrink below the 28px texture
		portrait.stretch_mode = TextureRect.STRETCH_SCALE
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(portrait)
		portrait.size = Vector2(16, 16)   # after add_child, once the minimum size has updated
		crew_health.append(bar(strip, Vector2(i * 22 + 1, 20), 16, STAT_COLORS.health))
		var needed := icon(strip, UI + "icons/exclaim.png", Vector2(i * 22 + 12, -4))
		needed.hide()
		crew_needed.append(needed)
		crew_slots.append(slot)

func _build_clock() -> void:
	var panel := frame("panel_dark.png", Rect2(392, 4, 84, 26))
	panel.name = "Clock"
	root.add_child(panel)
	clock_label = centered(text(panel, Vector2(0, 2), CREAM), 84)
	period_label = centered(text(panel, Vector2(0, 13), GOLD), 84)

func _build_objective() -> void:
	objective_card = frame("panel.png", Rect2(300, 32, 176, 22))
	objective_card.name = "Objective"
	root.add_child(objective_card)
	icon(objective_card, UI + "icons/exclaim.png", Vector2(4, 4))
	objective_label = text(objective_card, Vector2(14, 5), INK, 156)

func _build_map_panel() -> void:
	map_panel = frame("panel_dark.png", MAP_RECT)
	map_panel.name = "MiniMap"
	root.add_child(map_panel)
	map_title = text(map_panel, Vector2(5, 2), GOLD)
	minimap_view = preload("res://scripts/hud_minimap.gd").new()
	minimap_view.position = Vector2(3, MAP_HEADER)
	map_panel.add_child(minimap_view)

func setup_minimap(map: StationMap) -> void:
	minimap_view.setup(map, MAP_RECT.size - Vector2(6, MAP_HEADER + 3))

func toggle_minimap() -> void:
	map_expanded = not map_expanded
	minimap_view.visible = map_expanded
	var target_h := MAP_RECT.size.y if map_expanded else MAP_HEADER + 3.0
	map_panel.size.y = target_h
	map_panel.position.y = MAP_RECT.end.y - target_h

func _build_inventory() -> void:
	var width := SLOTS * 21 + 5
	inventory_panel = frame("panel_dark.png", Rect2((480 - width) / 2.0, 244, width, 24))
	inventory_panel.name = "Inventory"
	root.add_child(inventory_panel)
	for i in SLOTS:
		var slot := frame("slot.png", Rect2(3 + i * 21, 2, 20, 20))
		inventory_panel.add_child(slot)
		var item_icon := TextureRect.new()
		item_icon.position = Vector2(2, 2)
		item_icon.size = Vector2(16, 16)
		item_icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		slot.add_child(item_icon)
		inventory_slots.append(item_icon)

func _build_prompt() -> void:
	prompt_box = frame("panel_dark.png", Rect2(180, 225, 120, 17))
	root.add_child(prompt_box)
	var key := frame("key.png", Rect2(3, 2, 13, 13))
	prompt_box.add_child(key)
	prompt_key = centered(text(key, Vector2(0, 2), INK), 13)
	prompt_label = text(prompt_box, Vector2(20, 4), CREAM)
	prompt_box.hide()

func _build_room_banner() -> void:
	room_banner = frame("panel_dark.png", Rect2(170, 6, 140, 17))
	root.add_child(room_banner)
	room_label = centered(text(room_banner, Vector2(0, 4), GOLD), 140)
	room_banner.modulate.a = 0.0

func _build_dialogue() -> void:
	dialogue_box = frame("panel.png", Rect2(40, 204, 400, 60))
	dialogue_box.name = "Dialogue"
	root.add_child(dialogue_box)
	var portrait_slot := frame("slot.png", Rect2(6, 8, 44, 44))
	dialogue_box.add_child(portrait_slot)
	dialogue_portrait = TextureRect.new()
	dialogue_portrait.position = Vector2(4, 4)
	dialogue_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE  # shrink below the 28px texture
	dialogue_portrait.stretch_mode = TextureRect.STRETCH_SCALE
	dialogue_portrait.size = Vector2(36, 36)
	portrait_slot.add_child(dialogue_portrait)
	var banner := frame("banner.png", Rect2(56, -8, 96, 15))
	dialogue_box.add_child(banner)
	dialogue_name = centered(text(banner, Vector2(0, 4), CREAM), 96)
	dialogue_text = text(dialogue_box, Vector2(58, 11), INK, 334)
	dialogue_more = text(dialogue_box, Vector2(372, 46), MUTED)
	dialogue_more.text = "E ▼"
	dialogue_box.hide()

func _build_toast() -> void:
	toast = HBoxContainer.new()
	toast.position = Vector2(170, 80)
	toast.size = Vector2(140, 18)
	toast.alignment = BoxContainer.ALIGNMENT_CENTER
	toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(toast)
	toast_icon = TextureRect.new()
	toast.add_child(toast_icon)
	toast_label = text(toast, Vector2.ZERO, CREAM, 0.0, true)
	toast.modulate.a = 0.0

func _build_help() -> void:
	help = ColorRect.new()
	help.size = Vector2(480, 270)
	(help as ColorRect).color = Color("#120e16cc")
	help.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(help)
	var panel := frame("panel.png", Rect2(56, 18, 368, 238))
	help.add_child(panel)
	var banner := frame("banner.png", Rect2(124, -8, 120, 15))
	panel.add_child(banner)
	centered(text(banner, Vector2(0, 4), CREAM), 120).text = "HOW TO PLAY"
	var lines := [
		["GOAL", "Build, launch and run a forest satellite."],
		["", "Talk, use glowing spots. Gold ! = go there."], ["", ""],
		["WASD / ARROWS", "Walk"], ["E (hold)", "Talk, use and work"],
		["TAB / 1-4", "Look at another crewmate (view only)"], ["", "Walk to return to your own crewmate."],
		["M  /  N", "Station map  /  minimap"], ["H / ESC", "This page  /  keep playing"], ["", ""],
		["HEALTH", "Red bar. Fix: nap in Crew Quarters, or Med Bay."],
		["ENERGY", "Yellow bar. Fix: coffee (best), vending machine."],
		["FOOD", "Orange bar. Fix: food counter or vending machine."],
		["", "A low bar blinks red: SLEEP!, COFFEE! or EAT!"], ["", ""],
		["TEAM RULE", "Work alone, launch together. Do your own jobs."],
		["GOLD !", "Who or where the story needs"], ["RED TEXT", "Needs another crewmate or item"],
		["EXIT", "Back to mission select (click twice)"],
	]
	for i in lines.size():
		text(panel, Vector2(12, 13 + i * 12), MUTED).text = lines[i][0]
		text(panel, Vector2(100, 13 + i * 12), INK).text = lines[i][1]
	help.hide()

func _build_card() -> void:
	card = ColorRect.new()
	card.size = Vector2(480, 270)
	card.color = Color("#120e16")
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(card)
	card_title = centered(text(card, Vector2(0, 100), GOLD), 480)
	card_sub = centered(text(card, Vector2(0, 114), CREAM, 0.0, false, true), 480)
	card_hint = centered(text(card, Vector2(0, 200), MUTED), 480)
	card.hide()

func set_campaign_help() -> void:
	for label in help.find_children("*", "Label", true, false):
		if label.text == "Look at another crewmate (view only)":
			label.text = "Look at others (view only). Your role is locked."

# ── updates from world.gd ────────────────────────────────────────────────────
## healths: 0-1 per crewmate; needed: crew index the current beat requires (-1 = anyone).
func show_party(active: int, role_line: String, healths: Array, needed: int) -> void:
	card_portrait.texture = load(CrewRoster.portrait_path(CrewRoster.CREW[active].id))
	card_name.text = role_line.split(" · ")[0]
	card_name.tooltip_text = role_line
	card_name.add_theme_font_size_override("font_size", 8)
	for i in crew_slots.size():
		crew_slots[i].texture = load(UI + ("slot_selected.png" if i == active else "slot.png"))
		crew_slots[i].modulate = Color.WHITE if i == active else Color(0.8, 0.8, 0.85)
		crew_health[i].size.x = roundf(16.0 * clampf(healths[i], 0.0, 1.0))
		crew_needed[i].visible = i == needed and i != active
		crew_needed[i].position.y = -4.0 + (1.0 if int(Time.get_ticks_msec() / 300) % 2 == 0 else 0.0)

func show_stats(stats: CrewStats) -> void:
	var blink := int(Time.get_ticks_msec() / 250) % 2 == 0
	for key in STAT_KEYS:
		var value: float = stats.get(key)
		stat_fills[key].size.x = roundf(STAT_BAR_W * value / CrewStats.MAX)
		var low := value < CrewStats.LOW
		stat_fills[key].color = CREAM if low and blink else STAT_COLORS[key]
		# The label names the bar, and says where to go when it runs low.
		stat_labels[key].text = STAT_LOW_LABELS[key] if low else STAT_LABELS[key]
		stat_labels[key].add_theme_color_override("font_color", (CREAM if blink else RED) if low else MUTED)

func show_minimap(dots: Array, objective_pos: Vector2, follow: Vector2, room_name: String) -> void:
	map_title.text = room_name
	if map_expanded:
		minimap_view.refresh(dots, objective_pos, follow)

static func period_name(hour: int) -> String:
	if hour >= 5 and hour < 12:
		return "MORNING"
	if hour >= 12 and hour < 17:
		return "AFTERNOON"
	if hour >= 17 and hour < 21:
		return "EVENING"
	return "NIGHT"

func show_clock(day: int, minutes: int) -> void:
	clock_label.text = "DAY %d  %02d:%02d" % [day, (minutes / 60) % 24, minutes % 60]
	period_label.text = period_name((minutes / 60) % 24)

func show_operations_calendar(quarter: int) -> void:
	clock_label.text = "YEAR %d / Q%d" % [1 + int((quarter - 1) / 4), quarter]
	period_label.text = "OPERATIONS"

func show_objective(text_value: String) -> void:
	objective_card.visible = text_value != "" and round_ui
	if text_value != last_objective:
		if last_objective != "" and text_value != "":
			objective_flash = 1.2
		last_objective = text_value
		objective_label.text = text_value
		objective_card.size.y = 10.0 + objective_label.get_minimum_size().y

func show_inventory(icons: Array[String]) -> void:
	for i in inventory_slots.size():
		inventory_slots[i].texture = load(icons[i]) if i < icons.size() else null

func show_prompt(key: String, label: String, locked := false) -> void:
	prompt_box.visible = label != "" and not dialogue_box.visible
	prompt_key.text = key
	prompt_label.text = label
	prompt_label.add_theme_color_override("font_color", RED if locked else CREAM)
	var width := 26.0 + prompt_label.get_minimum_size().x
	prompt_box.size.x = width
	prompt_box.position.x = roundf(240.0 - width / 2.0)

func show_room(room_name: String) -> void:
	room_label.text = room_name
	room_banner.modulate.a = 1.0
	var tween := create_tween()
	tween.tween_interval(1.6)
	tween.tween_property(room_banner, "modulate:a", 0.0, 0.6)

## Points from the screen edge toward an off-screen objective (screen_pos in HUD pixels).
func show_edge_arrow(screen_pos: Vector2) -> void:
	var area := Rect2(Vector2(10, 74), Vector2(460, 158))   # screen edges, between the top and bottom HUD
	if screen_pos == Vector2.INF or Rect2(Vector2(16, 16), Vector2(448, 238)).has_point(screen_pos):
		edge_arrow.hide()
		return
	var center := Vector2(240, 144)
	var dir := (screen_pos - center).normalized()
	var t := INF
	for axis in 2:
		if dir[axis] != 0.0:
			var limit: float = (area.end[axis] if dir[axis] > 0.0 else area.position[axis]) - center[axis]
			t = minf(t, limit / dir[axis])
	edge_arrow.position = (center + dir * t).round()
	edge_arrow.rotation = dir.angle() - PI / 2.0
	edge_arrow.visible = int(Time.get_ticks_msec() / 350) % 4 != 0

func show_line(speaker_name: String, portrait: Texture2D, line: String) -> void:
	dialogue_box.show()
	_set_dialogue_mode(true)
	dialogue_name.text = speaker_name
	dialogue_portrait.texture = portrait
	full_text = line
	shown_chars = 0.0
	dialogue_text.text = ""

func line_finished() -> bool:
	return shown_chars >= full_text.length()

func finish_line() -> void:
	shown_chars = full_text.length()
	dialogue_text.text = full_text

func hide_dialogue() -> void:
	dialogue_box.hide()
	_set_dialogue_mode(false)

## While someone talks, the bottom of the screen belongs to the dialogue box.
func _set_dialogue_mode(talking: bool) -> void:
	inventory_panel.visible = round_ui and not talking
	map_panel.visible = round_ui and not talking
	if talking:
		prompt_box.hide()

func show_toast(toast_texture: Texture2D, label: String) -> void:
	toast_icon.texture = toast_texture
	toast_label.text = label
	toast.modulate.a = 1.0
	toast.position.y = 84
	var tween := create_tween().set_parallel(true)
	tween.tween_property(toast, "position:y", 70.0, 1.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(toast, "modulate:a", 0.0, 0.6).set_delay(1.6)

func toggle_help(on: bool) -> void:
	help.visible = on
	if is_instance_valid(mission_gauges):
		mission_gauges.visible = round_ui and not on and not dialogue_box.visible

func show_card(title: String, subtitle: String, hint := "") -> void:
	card.show()
	card.modulate.a = 1.0
	card_title.text = title
	card_sub.text = subtitle
	card_hint.text = hint

func fade_card(seconds: float) -> void:
	create_tween().tween_property(card, "modulate:a", 0.0, seconds).finished.connect(card.hide)

func set_round_ui(visible_now: bool) -> void:
	round_ui = visible_now
	for node_name in ["CrewCard", "CrewStrip", "Clock", "Objective"]:
		root.get_node(node_name).visible = visible_now
	for menu_button in [help_button, exit_button]:
		if is_instance_valid(menu_button):
			menu_button.visible = visible_now
	_set_dialogue_mode(dialogue_box.visible)
	if not visible_now:
		prompt_box.hide()
		edge_arrow.hide()
	if is_instance_valid(mission_gauges):
		mission_gauges.visible = visible_now

func show_mission_gauges(value: String) -> void:
	mission_gauges.text = value.replace(" · ", " / ")
	mission_gauges.visible = round_ui and not dialogue_box.visible

func play_hornbill() -> void:
	var bird := preload("res://scripts/hornbill.gd").new()
	root.add_child(bird)

func _process(delta: float) -> void:
	if dialogue_box.visible and not line_finished():
		shown_chars = minf(shown_chars + delta * TYPE_SPEED, full_text.length())
		dialogue_text.text = full_text.substr(0, int(shown_chars))
	dialogue_more.visible = dialogue_box.visible and line_finished() and int(Time.get_ticks_msec() / 400) % 2 == 0
	if objective_flash > 0.0:
		objective_flash -= delta
		objective_card.self_modulate = Color(1.4, 1.3, 0.8) if int(objective_flash * 8.0) % 2 == 0 else Color.WHITE
		objective_card.position.x = 300.0 - roundf(maxf(objective_flash - 0.9, 0.0) * 60.0)
	else:
		objective_card.self_modulate = Color.WHITE
		objective_card.position.x = 300.0

# ── HELP / EXIT buttons and the "viewing" banner ──────────────────────────────
func _build_menu_buttons() -> void:
	help_button = _small_button("HELP", Rect2(98, 55, 38, 13), func(): help_requested.emit(), "How to play (H)")
	exit_button = _small_button("EXIT", Rect2(140, 55, 36, 13), _on_exit_pressed, "Back to mission select. Click twice. Finished steps are saved.")
	view_banner = text(root, Vector2(180, 6), GOLD, 208, true)
	view_banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	view_banner.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	view_banner.size.x = 208
	view_banner.add_theme_font_size_override("font_size", 8)
	view_banner.hide()

func _small_button(caption: String, rect: Rect2, action: Callable, tip: String) -> Button:
	# The caption is a child label, so the button is exactly as small as its rectangle.
	var b := Button.new()
	b.text = ""
	b.position = rect.position
	b.size = rect.size
	b.custom_minimum_size = rect.size
	b.focus_mode = Control.FOCUS_NONE   # Space and Enter must never press these by accident
	b.tooltip_text = tip
	for state in ["normal", "hover", "pressed"]:
		var style := StyleBoxFlat.new()
		style.bg_color = Color("#2b3f4a") if state == "normal" else Color("#46636a")
		style.border_color = Color("#f2c94c") if state != "normal" else Color("#8a7464")
		style.set_border_width_all(1)
		style.set_corner_radius_all(2)
		style.content_margin_left = 0
		style.content_margin_right = 0
		style.content_margin_top = 0
		style.content_margin_bottom = 0
		b.add_theme_stylebox_override(state, style)
	var tag := Label.new()
	tag.text = caption
	tag.position = Vector2(0, 2)
	tag.size = Vector2(rect.size.x, 16)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	tag.add_theme_font_size_override("font_size", 8)
	tag.add_theme_color_override("font_color", CREAM)
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(tag)
	b.set_meta("tag", tag)
	b.mouse_entered.connect(func(): tag.add_theme_color_override("font_color", GOLD))
	b.mouse_exited.connect(func(): tag.add_theme_color_override("font_color", RED if b == exit_button and exit_armed else CREAM))
	b.pressed.connect(action)
	root.add_child(b)
	return b

func _on_exit_pressed() -> void:
	if not exit_armed:
		exit_armed = true
		_set_button_caption(exit_button, "SURE?", RED)
		get_tree().create_timer(2.5).timeout.connect(_disarm_exit)
		return
	exit_requested.emit()

func _disarm_exit() -> void:
	exit_armed = false
	if is_instance_valid(exit_button):
		_set_button_caption(exit_button, "EXIT", CREAM)

func _set_button_caption(b: Button, caption: String, color: Color) -> void:
	var tag: Label = b.get_meta("tag")
	tag.text = caption
	tag.add_theme_color_override("font_color", color)

## Shows "VIEWING JABU" while the camera looks at another crewmate; empty text hides it.
func show_view_banner(caption: String) -> void:
	view_banner.text = caption
	view_banner.visible = caption != "" and round_ui
