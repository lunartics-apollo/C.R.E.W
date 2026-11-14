extends Control
## Briefing and crew selection share the station's native 480 × 270 canvas.
signal confirmed

const INK := Color("#102532")
const GOLD := Color("#f0c68c")
const WHITE := Color("#fff4dc")
const MUTED := Color("#94b7b1")
var campaign: Campaign
var world: Node2D
var mission := 0
var selected := 0
var selecting := false
var line_index := 0
var lines: Array = []
var elapsed := 0.0
var dialogue: Label
var speaker: Label
var next_button: Button
var confirm_button: Button
var profile: Control
var crew_buttons: Array[Button] = []
var heading: Label
var hint: Label

func setup(progress: Campaign, mission_id: int, game_world: Node2D = null) -> void:
	campaign = progress
	world = game_world
	mission = mission_id
	selected = campaign.character if campaign.locked() else 0
	lines = Story.new(Campaign.MISSIONS[mission].story).data.briefing

func _ready() -> void:
	name = "Preflight"
	size = Vector2(480, 270)
	theme = PixelFont.theme()
	mouse_filter = Control.MOUSE_FILTER_STOP
	heading = label_at(self, "CREW BRIEFING", Vector2(16, 10), 400, 14, WHITE)
	label_at(self, Campaign.MISSIONS[mission].name + " / MESS HALL", Vector2(16, 31), 440, 9, MUTED)
	speaker = label_at(self, "", Vector2(28, 181), 420, 10, GOLD)
	dialogue = label_at(self, "", Vector2(28, 199), 420, 9, WHITE)
	next_button = button_at(self, "Next", "NEXT  >", Rect2(352, 244, 112, 21), advance)
	hint = label_at(self, "ENTER / SPACE: NEXT", Vector2(16, 249), 328, 8, MUTED)
	next_button.grab_focus()
	_show_line()

static func label_at(parent: Node, text: String, at: Vector2, width: float, font_size := 9, color := WHITE) -> Label:
	var label := Label.new()
	label.position = at
	label.size.x = width
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(label)
	return label

static func button_at(parent: Node, node_name: String, text: String, rect: Rect2, action: Callable) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.position = rect.position
	button.size = rect.size
	button.add_theme_font_size_override("font_size", 9)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#29434c")
	style.border_color = MUTED
	style.set_border_width_all(1)
	style.set_corner_radius_all(3)
	button.add_theme_stylebox_override("normal", style)
	var active := style.duplicate()
	active.bg_color = Color("#49645f")
	active.border_color = GOLD
	button.add_theme_stylebox_override("hover", active)
	button.add_theme_stylebox_override("focus", active)
	button.add_theme_stylebox_override("pressed", active)
	button.add_theme_color_override("font_color", WHITE)
	button.pressed.connect(action)
	parent.add_child(button)
	# Apply geometry after inheriting the pixel theme (the default font is taller).
	button.size = rect.size
	return button

func _process(delta: float) -> void:
	if selecting:
		return
	elapsed += delta
	dialogue.visible_characters = int(elapsed * 44)
	if elapsed > maxf(7.0, dialogue.text.length() / 34.0 + 2.5):
		advance()

func _show_line() -> void:
	elapsed = 0.0
	var crew: Dictionary = CrewRoster.CREW[lines[line_index][0]]
	speaker.text = "%s / %s    %d / %d" % [crew.name, crew.role, line_index + 1, lines.size()]
	speaker.modulate = crew.color.lightened(0.35)
	dialogue.text = lines[line_index][1]
	dialogue.visible_characters = 0
	next_button.text = "CHOOSE CREW >" if line_index == lines.size() - 1 else "NEXT >"
	if world != null:
		world.characters[lines[line_index][0]].say("...", 1.5)
	queue_redraw()

func advance() -> void:
	if selecting:
		return
	if dialogue.visible_characters >= 0 and dialogue.visible_characters < dialogue.text.length():
		elapsed = dialogue.text.length() / 44.0
		dialogue.visible_characters = -1
		return
	line_index += 1
	if line_index == lines.size():
		show_selection()
	else:
		_show_line()

func show_selection() -> void:
	if selecting:
		return
	selecting = true
	speaker.hide()
	dialogue.hide()
	next_button.hide()
	heading.text = "SELECT YOUR CREWMATE"
	# Remove the meeting-room subtitle before drawing the crew tabs.
	get_child(1).hide()
	for i in CrewRoster.CREW.size():
		var tab := button_at(self, "Crew%d" % i, CrewRoster.CREW[i].name, Rect2(16 + i * 114, 34, 108, 21), _select.bind(i))
		crew_buttons.append(tab)
	profile = Control.new()
	profile.name = "Profile"
	add_child(profile)
	confirm_button = button_at(self, "Confirm", "CONFIRM CREWMATE", Rect2(270, 240, 194, 25), _confirm)
	hint.position = Vector2(16, 242)
	hint.size.x = 243
	_select(selected)
	confirm_button.grab_focus()

func _select(index: int) -> void:
	selected = posmod(index, CrewRoster.CREW.size())
	for child in profile.get_children():
		profile.remove_child(child)
		child.queue_free()
	var crew: Dictionary = CrewRoster.CREW[selected]
	var details: Dictionary = CrewRoster.PROFILES[selected]
	var texture := AtlasTexture.new()
	texture.atlas = load(CrewRoster.sheet_path(crew.id))
	texture.region = Rect2(0, 0, 20, 26)
	var body := TextureRect.new()
	body.name = "FullBody"
	body.texture = texture
	body.position = Vector2(56, 87)
	body.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	body.size = Vector2(80, 104)
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	profile.add_child(body)
	label_at(profile, crew.name, Vector2(32, 201), 128, 14, crew.color.lightened(0.25))
	label_at(profile, crew.role, Vector2(194, 65), 268, 14, GOLD)
	label_at(profile, "SPECIALITY", Vector2(194, 91), 268, 8, MUTED)
	label_at(profile, details.speciality, Vector2(194, 103), 268)
	label_at(profile, "ABILITY", Vector2(194, 126), 268, 8, MUTED)
	label_at(profile, details.ability, Vector2(194, 138), 268)
	label_at(profile, "TEAM CONTRIBUTION", Vector2(194, 169), 268, 8, MUTED)
	label_at(profile, details.contribution, Vector2(194, 181), 264)
	var locked := campaign.locked()
	confirm_button.disabled = locked and selected != campaign.character
	confirm_button.text = "CONTINUE AS " + crew.name if locked else "CONFIRM " + crew.name
	hint.text = "%d / 3 COMPLETE. LOCKED TO %s." % [campaign.completed.size(), CrewRoster.CREW[campaign.character].name] if locked else "Your choice stays locked for 3 missions."
	for i in crew_buttons.size():
		crew_buttons[i].modulate = GOLD if i == selected else WHITE
	queue_redraw()

func _confirm() -> void:
	if campaign.locked():
		if selected != campaign.character:
			return
	elif not campaign.select_character(selected):
		hint.text = "Could not save. Please try again."
		return
	confirmed.emit()
	queue_free()

func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	if selecting:
		if event.keycode in [KEY_LEFT, KEY_RIGHT]:
			_select(selected + (-1 if event.keycode == KEY_LEFT else 1))
		elif event.keycode >= KEY_1 and event.keycode <= KEY_4:
			_select(event.keycode - KEY_1)
		elif event.keycode in [KEY_ENTER, KEY_SPACE]:
			var focused := get_viewport().gui_get_focus_owner()
			if focused in crew_buttons:
				_select(crew_buttons.find(focused))
			elif focused == confirm_button:
				_confirm()
		else:
			return
	elif event.keycode in [KEY_ENTER, KEY_SPACE]:
		advance()
	else:
		return
	get_viewport().set_input_as_handled()

func _draw() -> void:
	if selecting:
		draw_rect(Rect2(0, 0, 480, 270), INK)
		draw_style_box(_panel(Color("#203b45")), Rect2(16, 62, 160, 169))
		draw_line(Vector2(194, 84), Vector2(463, 84), GOLD)
		draw_ellipse_shadow(Vector2(96, 194), 42)
		return
	# The world camera shows the actual Mess Hall table behind the dialogue UI.
	draw_rect(Rect2(0, 0, 480, 49), INK)
	draw_rect(Rect2(0, 241, 480, 29), INK)
	draw_style_box(_panel(Color("#203b45")), Rect2(16, 174, 448, 67))

func _panel(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = MUTED.darkened(0.4)
	style.set_border_width_all(1)
	style.set_corner_radius_all(4)
	return style

func draw_ellipse_shadow(at: Vector2, radius: float) -> void:
	draw_set_transform(at, 0, Vector2(1, 0.18))
	draw_circle(Vector2.ZERO, radius, Color("#0c202b"))
	draw_set_transform(Vector2.ZERO)
