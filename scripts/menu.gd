extends Control

const ROCKET_FRAME := Vector2(44, 80)

var rocket_sheet: Texture2D = load("res://assets/sprites/rocket_spritesheet.png")
var time := 0.0
var controls_panel: PanelContainer
var play_button: Button
var world: Node2D
var starting := false
var reduced_motion := false
var low_quality := false
var selected_mission := 0
var mission_label: Label
var mission_number: Label
var mission_progress: ColorRect
var mission_tween: Tween
var progress_tween: Tween
var options_panel: Control
var intro_tween: Tween
var transition_tween: Tween
var intro_done := false
var launch_elapsed := 0.0
var camera_drift := Vector2.ZERO
var hover_energy := 0.0
var telemetry: Label
var telemetry_tick := -1
var skip_hint: Label
var preflight: Control
var transmission: Control
var presentation := BriefingSettings.new()
var seen_before_link: Array[int] = []
var link_camera: Tween
var camera_before_link := Vector2.ZERO
var zoom_before_link := Vector2.ONE

func _ready() -> void:
	world = get_parent().get_parent().get_node('World')
	world.campaign = Campaign.new()
	reduced_motion = presentation.reduced_motion
	selected_mission = world.campaign.next_mission()
	world.set_process(false)
	world.set_process_unhandled_input(false)
	world.get_node('HUD').hide()
	_build_interface()
	_change_mission(0)
	_start_intro()
	play_button.grab_focus()
	queue_redraw()

func _process(delta: float) -> void:
	if is_instance_valid(preflight) or is_instance_valid(transmission) or starting:
		return
	if not reduced_motion:
		time += delta
	if starting:
		launch_elapsed += delta
	var mouse := get_local_mouse_position()
	var target := Vector2(clampf((mouse.x - 240.0) / 240.0, -1.0, 1.0), clampf((mouse.y - 135.0) / 135.0, -1.0, 1.0)) if not reduced_motion else Vector2.ZERO
	camera_drift = camera_drift.lerp(target, 1.0 - exp(-delta * 2.5))
	hover_energy = lerpf(hover_energy, 1.0 if play_button.is_hovered() and not reduced_motion else 0.0, 1.0 - exp(-delta * 5.0))
	var tick := int(time * 4.0)
	if tick != telemetry_tick:
		telemetry_tick = tick
		telemetry.text = 'FOREST WATCH / %s' % ['DESIGN', 'REVIEW', 'OPERATE'][selected_mission]
	skip_hint.visible = not intro_done or starting
	skip_hint.text = 'ESC  SKIP LAUNCH' if starting else 'SPACE / ESC  SKIP INTRO'
	queue_redraw()

func _input(event: InputEvent) -> void:
	if is_instance_valid(preflight) or is_instance_valid(transmission):
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE and starting:
			_finish_transition()
			get_viewport().set_input_as_handled()
		elif event.keycode in [KEY_ESCAPE, KEY_SPACE] and not intro_done:
			_skip_intro()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_ESCAPE and options_panel.visible:
			options_panel.hide()
			play_button.grab_focus()
			get_viewport().set_input_as_handled()
		elif not starting and not options_panel.visible and not controls_panel.visible and event.keycode in [KEY_LEFT, KEY_RIGHT]:
			var focus := get_viewport().gui_get_focus_owner()
			if focus == get_node('MissionPrev') or focus == get_node('MissionNext'):
				_change_mission(-1 if event.keycode == KEY_LEFT else 1)
				get_viewport().set_input_as_handled()

func _draw() -> void:
	if is_instance_valid(preflight) or is_instance_valid(transmission) or starting:
		return
	# A layered sky and a hand-drawn launchpad, kept at the game's native resolution.
	var zoom := 1.0 + (0.14 * smoothstep(0.0, 2.2, launch_elapsed) if starting and not reduced_motion else 0.0)
	var offset := -camera_drift * 2.0 + Vector2(376, 165) * (1.0 - zoom)
	draw_set_transform(offset, 0.0, Vector2.ONE * zoom)
	draw_rect(Rect2(-20, -20, 520, 310), Color('#182b42'))
	for band in range(42):
		var height := band * 4
		var tint := Color('#172942').lerp(Color('#436a69'), float(band) / 42.0)
		draw_rect(Rect2(-20, height, 520, 4), tint)
	draw_rect(Rect2(0, 169, 480, 101), Color('#739667'))
	for i in range(26 if low_quality else 52):
		var x := float((i * 97 + 29) % 475)
		var y := float((i * 53 + 8) % 130)
		var light := 0.45 + 0.5 * (0.5 + 0.5 * sin(time * 1.6 + float(i)))
		draw_rect(Rect2(x, y, 2 if i % 8 == 0 else 1, 2 if i % 8 == 0 else 1), Color(1.0, 0.9, 0.69, light))
	draw_circle(Vector2(398, 50), 31, Color('#f1d3960d'))
	draw_circle(Vector2(398, 50), 26, Color('#f1d39614'))
	draw_circle(Vector2(398, 50), 21, Color('#efd396'))
	draw_rect(Rect2(390, 35, 6, 3), Color('#e7c587'))
	draw_rect(Rect2(405, 55, 5, 3), Color('#e7c587'))
	var cloud_offset := fmod(time * 2.0, 620.0)
	_cloud(Vector2(fmod(245.0 + cloud_offset, 620.0) - 100.0, 84), Color('#8ba6a299'))
	_cloud(Vector2(fmod(410.0 + cloud_offset * 0.65, 620.0) - 100.0, 109), Color('#b6b7a380'))
	_cloud(Vector2(fmod(560.0 + cloud_offset * 0.4, 620.0) - 100.0, 126), Color('#d0c7a052'))
	# Orbital markers and slow-moving depth particles suggest activity without competing with navigation.
	for i in range(11 if low_quality else 22):
		var drift := fmod(time * (1.5 + float(i % 4)) + float(i * 19), 190.0)
		var px := 246 + (i * 47) % 230
		var py := 28 + int(drift)
		draw_rect(Rect2(px + camera_drift.x * float(i % 3), py, 1, 1), Color('#d3e1bb80'))
	# A small satellite crosses the sky behind the launch tower.
	var satellite := Vector2(260 + fmod(time * 5.0, 230.0), 75 + roundf(sin(time * 0.6) * 3.0))
	draw_rect(Rect2(satellite + Vector2(-10, -2), Vector2(7, 4)), Color('#638e9a'))
	draw_rect(Rect2(satellite + Vector2(4, -2), Vector2(7, 4)), Color('#638e9a'))
	draw_rect(Rect2(satellite + Vector2(-3, -3), Vector2(7, 6)), Color('#f1d49c'))
	draw_rect(Rect2(satellite + Vector2(-1, -2), Vector2(3, 3)), Color('#94c6c1'))
	draw_colored_polygon(PackedVector2Array([Vector2(0,165), Vector2(57,126), Vector2(100,153), Vector2(155,112), Vector2(210,160), Vector2(263,124), Vector2(316,162), Vector2(372,123), Vector2(430,160), Vector2(480,128), Vector2(480,220), Vector2(0,220)]), Color('#355e5a'))
	draw_colored_polygon(PackedVector2Array([Vector2(0,185), Vector2(64,153), Vector2(113,180), Vector2(158,145), Vector2(212,182), Vector2(272,153), Vector2(320,183), Vector2(378,153), Vector2(430,178), Vector2(480,152), Vector2(480,220), Vector2(0,220)]), Color('#507b65'))
	draw_rect(Rect2(0, 205, 480, 65), Color('#729563'))
	draw_rect(Rect2(0, 229, 480, 41), Color('#5f825c'))
	for i in range(65):
		var x := (i * 73 + 11) % 480
		var y := 206 + (i * 29) % 62
		draw_rect(Rect2(x, y, 2, 1), Color('#a1bb7a'))
	# Launchpad, illuminated gantry, moving lift and a fueling arm.
	draw_rect(Rect2(294, 220, 166, 7), Color('#445750'))
	draw_rect(Rect2(304, 215, 146, 6), Color('#b8b9a2'))
	draw_rect(Rect2(321, 205, 112, 10), Color('#687d78'))
	draw_rect(Rect2(407, 114, 5, 97), Color('#735953'))
	draw_rect(Rect2(442, 114, 5, 97), Color('#735953'))
	draw_rect(Rect2(410, 114, 33, 3), Color('#b38c75'))
	for i in range(6):
		var y := 119 + i * 15
		draw_line(Vector2(412, y), Vector2(442, y + 13), Color('#c9a487'), 2)
		draw_line(Vector2(442, y), Vector2(412, y + 13), Color('#a47c6b'), 1)
	draw_rect(Rect2(405, 109, 44, 5), Color('#d7b596'))
	draw_rect(Rect2(423, 101, 4, 8), Color('#d7b596'))
	draw_rect(Rect2(422, 98, 6, 3), Color('#ffe6a6') if fmod(time, 2.0) < 0.9 else Color('#9c5c53'))
	var lift_y := 158.0 + roundf(sin(time * 0.7) * 12.0)
	draw_rect(Rect2(414, lift_y, 26, 7), Color('#445d60'))
	draw_rect(Rect2(416, lift_y + 1, 22, 2), Color('#f0cb8e'))
	# Every cycle: retract the service arm, ignite, launch, then prepare again.
	var phase := 5.0 + launch_elapsed * 2.8 if starting and not reduced_motion else (0.0 if reduced_motion else fmod(time, 18.0))
	var arm_retract := clampf(launch_elapsed / 0.45, 0.0, 1.0) if starting else (clampf((phase - 3.5) / 1.5, 0.0, 1.0) if phase < 14.0 else clampf((18.0 - phase) / 4.0, 0.0, 1.0))
	var arm_x := 391.0 + roundf(arm_retract * 14.0)
	draw_rect(Rect2(arm_x, 143, 410 - arm_x, 3), Color('#8e6e61'))
	draw_rect(Rect2(arm_x, 139, 3, 7), Color('#c8a17e'))
	var ignition := phase >= 5.0 and phase < 11.5
	var travel := clampf((phase - 6.2) / 5.3, 0.0, 1.0)
	var rocket_rise := roundf(250.0 * travel * travel)
	var rocket_origin := Vector2(356, 126 - rocket_rise)
	if ignition:
		_draw_exhaust(rocket_origin, phase)
	if phase < 11.5 or phase >= 16.0:
		_draw_rocket(rocket_origin if phase < 11.5 else Vector2(356, 126))
	# Exhaust clouds spread out over the pad and dissipate after liftoff.
	if phase >= 5.0 and phase < 13.0:
		var fade := clampf((13.0 - phase) / 2.5, 0.0, 1.0)
		for i in range(8 if low_quality else 16):
			var progress := fmod((phase - 5.0) * 14.0 + i * 4.0, 35.0)
			var side := -1.0 if i % 2 == 0 else 1.0
			var smoke := Vector2(378 + side * (10 + progress), 211 - progress * 0.3 + (i % 3) * 3).round()
			draw_rect(Rect2(smoke, Vector2(8 + int(progress / 6), 5 + i % 4)), Color(0.78, 0.81, 0.73, fade * 0.68))
	for i in range(9):
		var sparkle := Vector2(306 + (i * 31) % 140, 188 + (i * 17) % 50)
		sparkle.y -= fmod(time * (3.0 + i % 3), 14.0)
		draw_rect(Rect2(sparkle.round(), Vector2(1, 1)), Color('#fbe8a8aa'))
	# Warm lighting reacts to the focused primary action and to ignition.
	if hover_energy > 0.01 or ignition:
		draw_circle(Vector2(378, 205), 35, Color(1.0, 0.65, 0.30, 0.04 * hover_energy + (0.07 if ignition else 0.0)))
	draw_set_transform(Vector2.ZERO)
	# A small decorative telemetry strip stays clear of the moon and buttons.
	for i in range(18):
		var level := 2.0 + 4.0 * (0.5 + 0.5 * sin(time * 1.8 + float(i) * 0.65))
		draw_rect(Rect2(402 + i * 3, 27 - level, 2, level), Color('#b1ddc77a'))
	# A soft edge keeps the animated scene visible around the menu.
	draw_rect(Rect2(0, 0, 176, 270), Color('#102334e8'))
	for i in range(48):
		draw_rect(Rect2(176 + i, 0, 1, 270), Color(0.063, 0.137, 0.204, 0.91 * (1.0 - float(i) / 48.0)))
	draw_rect(Rect2(24, 19, 24, 2), Color('#f2c78d'))
	draw_rect(Rect2(26, 236, 158, 1), Color('#aac8b980'))

func _cloud(pos: Vector2, color: Color) -> void:
	draw_rect(Rect2(pos + Vector2(0, 7), Vector2(44, 5)), color)
	draw_rect(Rect2(pos + Vector2(9, 3), Vector2(25, 8)), color)
	draw_rect(Rect2(pos + Vector2(17, 0), Vector2(13, 8)), color)

func _draw_exhaust(r: Vector2, phase: float) -> void:
	var flicker := int(fmod(phase * 13.0, 5.0))
	for engine in [8, 22, 36]:
		var length := 16 + flicker * 2 if engine == 22 else 12 + (4 - flicker) * 2
		var nozzle := r + Vector2(engine, 77)
		draw_colored_polygon(PackedVector2Array([nozzle + Vector2(-5, 0), nozzle + Vector2(5, 0), nozzle + Vector2(3, length * 0.58), nozzle + Vector2(0, length), nozzle + Vector2(-3, length * 0.58)]), Color('#d45c38'))
		draw_colored_polygon(PackedVector2Array([nozzle + Vector2(-3, 0), nozzle + Vector2(3, 0), nozzle + Vector2(2, length * 0.55), nozzle + Vector2(0, length - 3), nozzle + Vector2(-2, length * 0.55)]), Color('#ffb34f'))
		draw_rect(Rect2(nozzle + Vector2(-1, 0), Vector2(3, 8 + flicker)), Color('#fff2b5'))
	for i in range(9):
		var drift := fmod(phase * (10.0 + i) + i * 7.0, 25.0)
		draw_rect(Rect2((r + Vector2(13 + (i * 7) % 19, 80 + drift)).round(), Vector2(2, 2)), Color('#ffd078'))

func _draw_rocket(r: Vector2) -> void:
	# The shared Pixelorama rocket sprite (44x80, engines at x 8 / 22 / 36 like _draw_exhaust
	# expects); its two frames blink the nav light at the tip.
	var frame := 0 if fmod(time, 1.0) < 0.5 else 1
	draw_texture_rect_region(rocket_sheet, Rect2(r, ROCKET_FRAME), Rect2(Vector2(ROCKET_FRAME.x * frame, 0), ROCKET_FRAME))

func _build_interface() -> void:
	_label(self, 'OUR FORESTS. OUR FUTURE.', Vector2(24, 27), 8, '#aacbbf')
	_label(self, 'C.R.E.W', Vector2(21, 41), 25, '#fff4dc')
	_label(self, 'BORNEO FOREST WATCH', Vector2(24, 72), 8, '#f2c78d')
	_label(self, 'SARAWAK / ONE CUBESAT / TWO YEARS', Vector2(24, 83), 7, '#f2c78d')
	_label(self, 'SELECT MISSION', Vector2(25, 105), 8, '#aacbbf')
	var status := _label(self, 'READY', Vector2(155, 106), 7, '#a8d1b8')
	status.name = 'MissionStatus'
	var info := Control.new()
	info.name = 'MissionInfo'
	info.position = Vector2(25, 118)
	info.size = Vector2(112, 16)
	info.clip_contents = true
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(info)
	mission_number = _label(info, '01', Vector2(0, 0), 9, '#f0c68c')
	mission_number.name = 'MissionNumber'
	mission_label = _label(info, 'DESIGN', Vector2(21, 0), 9, '#fff4dc')
	mission_label.name = 'MissionName'
	var prev := _small_button('MissionPrev', '‹', Vector2(145, 118))
	prev.pressed.connect(func(): _change_mission(-1))
	var next := _small_button('MissionNext', '›', Vector2(164, 118))
	next.pressed.connect(func(): _change_mission(1))
	prev.focus_neighbor_right = prev.get_path_to(next)
	next.focus_neighbor_left = next.get_path_to(prev)
	var track := ColorRect.new()
	track.name = 'MissionProgressTrack'
	track.position = Vector2(25, 139)
	track.size = Vector2(154, 1)
	track.color = Color('#51716b')
	track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(track)
	mission_progress = ColorRect.new()
	mission_progress.name = 'MissionProgress'
	mission_progress.size = Vector2(77, 1)
	mission_progress.color = Color('#f0c68c')
	mission_progress.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.add_child(mission_progress)
	telemetry = _label(self, '', Vector2(324, 10), 7, '#c7dfcb')
	telemetry.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	telemetry.size.x = 142
	var box := VBoxContainer.new()
	box.name = 'Menu'
	box.position = Vector2(24, 147)
	box.size = Vector2(158, 87)
	box.add_theme_constant_override('separation', 4)
	add_child(box)
	play_button = _button(box, 'Play', 'LET EXPLORE', true)
	play_button.pressed.connect(_start_mission)
	var controls := _button(box, 'Controls', 'HOW TO PLAY', false)
	controls.pressed.connect(_show_controls)
	var options := _button(box, 'Options', 'OPTIONS', false)
	options.pressed.connect(_show_options)
	var quit_button := _button(box, 'Quit', 'QUIT GAME', false)
	quit_button.pressed.connect(func(): get_tree().quit())
	_label(self, 'EXPLORE  /  BUILD  /  DISCOVER', Vector2(24, 248), 8, '#bed4bb')
	skip_hint = _label(self, 'SPACE / ESC  SKIP INTRO', Vector2(338, 251), 7, '#f6e3b8')
	_build_controls_panel()
	_build_options_panel()

func _small_button(node_name: String, caption: String, pos: Vector2) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = caption
	button.position = pos
	button.custom_minimum_size = Vector2(15, 14)
	button.size = Vector2(15, 14)
	button.add_theme_font_size_override('font_size', 10)
	button.add_theme_color_override('font_color', Color('#f5d09b'))
	button.add_theme_color_override('font_hover_color', Color('#fff4dc'))
	button.add_theme_color_override('font_focus_color', Color('#fff4dc'))
	button.add_theme_color_override('font_pressed_color', Color('#182b42'))
	button.add_theme_stylebox_override('normal', _arrow_style('#00000000', '#00000000'))
	button.add_theme_stylebox_override('hover', _arrow_style('#42696b', '#a9d0bd'))
	button.add_theme_stylebox_override('pressed', _arrow_style('#f0c68c', '#f0c68c'))
	button.add_theme_stylebox_override('focus', _arrow_style('#00000000', '#f0c68c'))
	add_child(button)
	button.size = Vector2(15, 14)
	return button

func _arrow_style(background: String, border: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(background)
	style.border_color = Color(border)
	style.set_border_width_all(1)
	style.set_content_margin_all(0)
	return style

func _change_mission(direction: int) -> void:
	selected_mission = posmod(selected_mission + direction, Campaign.MISSIONS.size())
	if mission_tween and mission_tween.is_running(): mission_tween.kill()
	if progress_tween and progress_tween.is_running(): progress_tween.kill()
	mission_number.text = '%02d' % (selected_mission + 1)
	mission_label.text = Campaign.MISSIONS[selected_mission].name
	var progress: Campaign = world.campaign
	var locked := selected_mission > 0 and (not progress.completed.has(selected_mission - 1) or not progress.locked())
	if selected_mission == 1 and progress.forest.state.launch_resolved:
		locked = progress.completed.has(1)
	play_button.disabled = locked
	# Saved progress resumes automatically; say so on the button.
	var has_progress: bool = progress.character >= 0 and (progress.completed.size() > 0 or int(progress.beats.get(str(selected_mission), 0)) > 0)
	play_button.text = 'NEW PROJECT' if selected_mission == 0 and progress.forest.state.launch_resolved else ('CONTINUE' if has_progress and not progress.completed.has(selected_mission) else 'START')
	if selected_mission == 0 and progress.completed.has(0) and not progress.forest.state.launch_resolved:
		play_button.text = 'REVISE DESIGN'
	get_node('MissionStatus').text = 'LOCKED' if locked else ('DONE' if progress.completed.has(selected_mission) else 'READY')
	mission_number.position.x = 0
	mission_label.position.x = 21
	mission_number.modulate.a = 1.0
	mission_label.modulate.a = 1.0
	if reduced_motion:
		mission_progress.size.x = (154.0 / 3.0) * (selected_mission + 1)
	else:
		mission_number.position.x = 4 * direction
		mission_label.position.x = 21 + 7 * direction
		mission_number.modulate.a = 0.0
		mission_label.modulate.a = 0.0
		mission_tween = create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		mission_tween.tween_property(mission_number, 'position:x', 0.0, 0.20)
		mission_tween.tween_property(mission_number, 'modulate:a', 1.0, 0.16)
		mission_tween.tween_property(mission_label, 'position:x', 21.0, 0.24).set_delay(0.04)
		mission_tween.tween_property(mission_label, 'modulate:a', 1.0, 0.18).set_delay(0.04)
		progress_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		progress_tween.tween_property(mission_progress, 'size:x', (154.0 / 3.0) * (selected_mission + 1), 0.28)
	telemetry_tick = -1

func _button(parent: Node, node_name: String, caption: String, primary: bool) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = caption
	button.custom_minimum_size = Vector2(158, 20)
	button.add_theme_font_size_override('font_size', 9)
	button.add_theme_color_override('font_color', Color('#3c3935') if primary else Color('#e5edda'))
	button.add_theme_color_override('font_hover_color', Color('#303b38'))
	button.add_theme_color_override('font_focus_color', Color('#303b38'))
	button.add_theme_stylebox_override('normal', _style('#f0c68c' if primary else '#28434bdb', '#f5d9aa' if primary else '#92b2aa80'))
	button.add_theme_stylebox_override('hover', _style('#f9dfb1', '#fff5d9'))
	button.add_theme_stylebox_override('pressed', _style('#dcaa76', '#f5ce9c'))
	button.add_theme_stylebox_override('focus', _focus_style())
	button.mouse_entered.connect(func(): button.grab_focus())
	parent.add_child(button)
	return button

func _style(bg: String, border: String) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(bg)
	style.border_color = Color(border)
	style.set_border_width_all(1)
	style.set_corner_radius_all(7)
	return style

func _focus_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color.TRANSPARENT
	style.border_color = Color('#fff4d4')
	style.set_border_width_all(1)
	style.set_corner_radius_all(7)
	style.set_expand_margin_all(2)
	return style

func _start_mission() -> void:
	if starting or is_instance_valid(preflight) or is_instance_valid(transmission) or play_button.disabled:
		return
	_skip_intro()
	seen_before_link.assign(presentation.seen)
	for child in get_children():
		if child is CanvasItem:
			child.hide()
	transmission = preload('res://scripts/transmission.gd').new()
	transmission.setup(world.campaign, selected_mission, presentation)
	transmission.accepted.connect(_accept_transmission)
	transmission.declined.connect(_decline_transmission)
	add_child(transmission)
	camera_before_link = world.camera.position
	zoom_before_link = world.camera.zoom
	if not reduced_motion:
		link_camera = create_tween().set_parallel(true)
		link_camera.tween_property(world.camera, 'position', world.map.spots['upload_flight_plan'].pos + Vector2(0, 25), 0.8).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
		link_camera.tween_property(world.camera, 'zoom', Vector2(2, 2), 0.8).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	queue_redraw()

func _close_transmission() -> void:
	if link_camera != null and link_camera.is_valid():
		link_camera.kill()
	if is_instance_valid(transmission):
		remove_child(transmission)
		transmission.queue_free()
		transmission = null
	reduced_motion = presentation.reduced_motion
	get_node('OptionsPanel/Motion').text = 'REDUCED MOTION: ON' if reduced_motion else 'REDUCED MOTION: OFF'

func _decline_transmission() -> void:
	selected_mission = transmission.stage
	_close_transmission()
	world.camera.position = camera_before_link
	world.camera.zoom = zoom_before_link
	world.camera.reset_smoothing()
	world.camera.force_update_scroll()
	for child in get_children():
		if child is CanvasItem and child != controls_panel and child != options_panel:
			child.show()
	_change_mission(0)
	play_button.grab_focus()
	queue_redraw()

func _accept_transmission(stage: int) -> void:
	selected_mission = stage
	_close_transmission()
	_begin_preflight()

func _begin_preflight() -> void:
	# A project is restarted only after explicit authorization, never on preview.
	if selected_mission == 0 and world.campaign.forest.state.launch_resolved:
		if not world.campaign.restart_project():
			for child in get_children():
				if child is CanvasItem and child != controls_panel and child != options_panel:
					child.show()
			get_node('MissionStatus').text = 'SAVE ERROR'
			return
	var from: Vector2 = world.camera.position
	world.gather_at_mess_table()
	var target: Vector2 = world.camera.position
	preflight = preload('res://scripts/preflight.gd').new()
	preflight.setup(world.campaign, selected_mission, world)
	preflight.confirmed.connect(_launch_selected)
	add_child(preflight)
	if selected_mission in seen_before_link and world.campaign.character >= 0:
		preflight.show_selection()
	elif not reduced_motion:
		world.camera.position = from
		world.camera.force_update_scroll()
		link_camera = create_tween()
		link_camera.tween_property(world.camera, 'position', target, 0.5).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	queue_redraw()

func _launch_selected() -> void:
	if starting:
		return
	if link_camera != null and link_camera.is_valid():
		link_camera.kill()
	_skip_intro()
	starting = true
	world.set_mission(selected_mission)
	world.start_chapter()
	for child in get_node('Menu').get_children():
		child.disabled = true
	get_node('MissionPrev').disabled = true
	get_node('MissionNext').disabled = true
	controls_panel.hide()
	options_panel.hide()
	transition_tween = create_tween()
	transition_tween.tween_interval(0.2)
	transition_tween.tween_callback(_finish_transition)
	queue_redraw()

func _finish_transition() -> void:
	if transition_tween and transition_tween.is_running():
		transition_tween.kill()
	world.set_process(true)
	world.set_process_unhandled_input(true)
	world.get_node('HUD').show()
	get_parent().queue_free()

func _start_intro() -> void:
	intro_tween = create_tween().set_parallel(true)
	var delay := 0.0
	for child in get_children():
		if child is Control and child != controls_panel and child != options_panel:
			child.set_meta('intro_x', child.position.x)
			child.position.x -= 7.0
			child.modulate.a = 0.0
			intro_tween.tween_property(child, 'modulate:a', 1.0, 0.22).set_delay(delay)
			intro_tween.tween_property(child, 'position:x', child.get_meta('intro_x'), 0.32).set_delay(delay).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
			delay += 0.06
	intro_tween.tween_callback(func(): intro_done = true).set_delay(delay + 0.32)

func _skip_intro() -> void:
	if intro_tween and intro_tween.is_running():
		intro_tween.kill()
	for child in get_children():
		if child is CanvasItem:
			child.modulate.a = 1.0
		if child is Control and child.has_meta('intro_x'):
			child.position.x = child.get_meta('intro_x')
	intro_done = true

func _label(parent: Node, caption: String, pos: Vector2, size: int, color: String) -> Label:
	var label := Label.new()
	label.text = caption
	label.position = pos
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override('font_size', size)
	label.add_theme_color_override('font_color', Color(color))
	parent.add_child(label)
	return label

func _build_controls_panel() -> void:
	controls_panel = PanelContainer.new()
	controls_panel.name = 'ControlsPanel'
	controls_panel.position = Vector2(247, 61)
	controls_panel.size = Vector2(216, 141)
	controls_panel.add_theme_stylebox_override('panel', _style('#213b3c', '#eac88b'))
	controls_panel.visible = false
	add_child(controls_panel)
	var info := Label.new()
	info.text = '   BORNEO FOREST WATCH\n\n   WASD / Arrow keys   Move\n   E / Space / Enter        Interact\n\n   Design / Review & Launch / Operate\n   Watch Sarawak. Return the data.'
	info.add_theme_font_size_override('font_size', 10)
	info.add_theme_color_override('font_color', Color('#fff0ce'))
	controls_panel.add_child(info)
	var close := Button.new()
	close.name = 'Close'
	close.text = 'BACK'
	close.custom_minimum_size = Vector2(62, 22)
	close.size_flags_horizontal = Control.SIZE_SHRINK_END
	close.size_flags_vertical = Control.SIZE_SHRINK_END
	close.add_theme_font_size_override('font_size', 10)
	close.pressed.connect(func(): controls_panel.hide(); play_button.grab_focus())
	controls_panel.add_child(close)

func _show_controls() -> void:
	_skip_intro()
	options_panel.hide()
	controls_panel.show()
	controls_panel.get_node('Close').grab_focus()

func _build_options_panel() -> void:
	var panel := Panel.new()
	panel.name = 'OptionsPanel'
	panel.position = Vector2(246, 59)
	panel.size = Vector2(218, 174)
	panel.add_theme_stylebox_override('panel', _style('#182f38f7', '#a8c8b6'))
	panel.visible = false
	add_child(panel)
	options_panel = panel
	_label(panel, 'ACCESSIBILITY & DISPLAY', Vector2(12, 10), 10, '#f6e4c4')
	_label(panel, 'Changes apply immediately.', Vector2(12, 28), 8, '#b6cfc2')
	var motion := Button.new()
	motion.name = 'Motion'
	motion.position = Vector2(12, 45)
	motion.size = Vector2(194, 22)
	motion.text = 'REDUCED MOTION: ON' if reduced_motion else 'REDUCED MOTION: OFF'
	motion.add_theme_font_size_override('font_size', 9)
	motion.pressed.connect(func():
		reduced_motion = not reduced_motion
		presentation.reduced_motion = reduced_motion
		presentation.save()
		motion.text = 'REDUCED MOTION: ON' if reduced_motion else 'REDUCED MOTION: OFF'
	)
	panel.add_child(motion)
	var quality := Button.new()
	quality.name = 'Quality'
	quality.position = Vector2(12, 72)
	quality.size = Vector2(194, 22)
	quality.text = 'EFFECTS QUALITY: HIGH'
	quality.add_theme_font_size_override('font_size', 9)
	quality.pressed.connect(func():
		low_quality = not low_quality
		quality.text = 'EFFECTS QUALITY: LOW' if low_quality else 'EFFECTS QUALITY: HIGH'
	)
	panel.add_child(quality)
	var mode := Button.new()
	mode.name = 'Mode'
	mode.position = Vector2(12, 99)
	mode.size = Vector2(194, 22)
	mode.add_theme_font_size_override('font_size', 9)
	mode.text = 'MODE: ' + world.campaign.forest.state.mode.to_upper()
	mode.pressed.connect(func():
		var modes := ['cadet', 'engineer']
		var previous: String = world.campaign.forest.state.mode
		world.campaign.forest.state.mode = modes[posmod(modes.find(previous) + 1, modes.size())]
		if not world.campaign.save():
			world.campaign.forest.state.mode = previous
		mode.text = 'MODE: ' + world.campaign.forest.state.mode.to_upper()
	)
	panel.add_child(mode)
	var close := Button.new()
	close.name = 'Close'
	close.position = Vector2(140, 139)
	close.size = Vector2(66, 23)
	close.text = 'BACK'
	close.add_theme_font_size_override('font_size', 9)
	close.pressed.connect(func(): panel.hide(); play_button.grab_focus())
	panel.add_child(close)

func _show_options() -> void:
	_skip_intro()
	controls_panel.hide()
	options_panel.show()
	options_panel.get_node('Motion').grab_focus()
