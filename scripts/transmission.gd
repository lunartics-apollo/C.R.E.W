extends Control
## Presentation-only terminal. Campaign writes belong to the accepting caller.
signal accepted(stage: int)
signal declined

enum Phase { INCOMING, BOOTING, REVEALING, SPEAKING, AUTHORIZING, CLOSED }
const UI := preload("res://scripts/preflight.gd")
const INK := Color("#0b1c29")
const WHITE := Color("#edf0d9")
const GOLD := Color("#f0c68c")
const TEAL := Color("#92c3b3")
const MUTE := Color("#718f91")
const CUES := "res://assets/briefing/"

var campaign: Campaign
var preferences: BriefingSettings
var stage := 0
var phase := Phase.INCOMING
var kind := "briefing"
var report_data: Dictionary = {}
var data: Dictionary = {}
var stage_data: Dictionary = {}
var segments: Array = []
var segment_index := 0
var shown_chars := 0.0
var clock := 0.0
var pause_left := 0.0
var tick_left := 0.0
var authorization_clock := 0.0
var authorization_duration := 0.9
var acknowledgment: Dictionary = {}
var power := 0.0
var sequence: Tween
var actor: TransmissionSpeaker
var intel: Control
var feed: Control
var subtitle: Label
var stage_label: Label
var speaker_label: Label
var role_label: Label
var status: Label
var key_hint: Label
var incoming: Control
var dossier: Control
var dossier_scroll: ScrollContainer
var settings_panel: Control
var effect: ColorRect
var accept_button: Button
var next_button: Button
var back_button: Button
var previous_stage: Button
var next_stage: Button
var speed_button: Button
var captions_button: Button
var motion_button: Button
var sound_button: Button
var volume_slider: HSlider
var sfx: AudioStreamPlayer
var speech_fx: AudioStreamPlayer
var voice: AudioStreamPlayer

func setup(progress: Campaign, index: int, settings: BriefingSettings = null) -> void:
	campaign = progress
	stage = clampi(index, 0, 2)
	preferences = settings if settings != null else BriefingSettings.new()

func setup_report(progress: Campaign, result: Dictionary, settings: BriefingSettings = null) -> void:
	setup(progress, 2, settings)
	kind = "report"
	report_data = result

func _ready() -> void:
	name = "Transmission"
	size = Vector2(480, 270)
	pivot_offset = size / 2
	theme = PixelFont.theme()
	mouse_filter = Control.MOUSE_FILTER_STOP
	if preferences == null:
		preferences = BriefingSettings.new()
	data = JSON.parse_string(FileAccess.get_file_as_string("res://data/briefings.json"))
	_build_terminal()
	_load_stage(false)
	if kind == "report" or preferences.seen.has(stage):
		skip_animation()
	else:
		_play("incoming")
		accept_button.grab_focus()

func label(parent: Node, value: String, at: Vector2, width: float, font_size := 9, color := WHITE) -> Label:
	return UI.label_at(parent, value, at, width, font_size, color)

func key(parent: Node, node_name: String, value: String, rect: Rect2, action: Callable) -> Button:
	var button := UI.button_at(parent, node_name, value, rect, action)
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("#203b45")
	normal.border_color = Color("#527779")
	normal.set_border_width_all(1)
	normal.content_margin_left = 2
	normal.content_margin_right = 2
	normal.content_margin_top = 2
	normal.content_margin_bottom = 2
	var active := normal.duplicate()
	active.bg_color = Color("#36564f")
	active.border_color = GOLD
	for state in ["normal", "disabled"]:
		button.add_theme_stylebox_override(state, normal)
	for state in ["hover", "focus", "pressed"]:
		button.add_theme_stylebox_override(state, active)
	button.add_theme_color_override("font_disabled_color", MUTE)
	button.size = rect.size
	button.mouse_entered.connect(func():
		if not button.disabled:
			button.grab_focus()
	)
	return button

func _build_terminal() -> void:
	label(self, "C.R.E.W // MISSION CONTROL", Vector2(29, 24), 242, 9, WHITE)
	stage_label = label(self, "", Vector2(272, 24), 134, 8, GOLD)
	previous_stage = key(self, "PreviousStage", "<", Rect2(410, 21, 17, 17), navigate_stage.bind(-1))
	next_stage = key(self, "NextStage", ">", Rect2(432, 21, 17, 17), navigate_stage.bind(1))
	feed = Control.new()
	feed.name = "VideoFeed"
	feed.position = Vector2(30, 48)
	feed.size = Vector2(207, 120)
	feed.clip_contents = true
	feed.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(feed)
	actor = TransmissionSpeaker.new()
	actor.name = "Speaker"
	actor.position = Vector2(103, 64)
	feed.add_child(actor)
	speaker_label = label(feed, "", Vector2(6, 3), 194, 8, TEAL)
	role_label = label(feed, "", Vector2(6, 108), 194, 7, TEAL)
	intel = preload("res://scripts/transmission_intel.gd").new()
	intel.position = Vector2(241, 48)
	intel.forest = campaign.forest if campaign != null else ForestMission.new()
	add_child(intel)
	# Copy only after drawing the video; controls and subtitles remain unfiltered.
	var copy := BackBufferCopy.new()
	copy.copy_mode = BackBufferCopy.COPY_MODE_VIEWPORT
	add_child(copy)
	effect = ColorRect.new()
	effect.position = Vector2(28, 46)
	effect.size = Vector2(424, 124)
	effect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader := ShaderMaterial.new()
	shader.shader = preload("res://assets/briefing/monitor.gdshader")
	effect.material = shader
	add_child(effect)
	subtitle = label(self, "", Vector2(36, 188), 408, 9, WHITE)
	status = label(self, "", Vector2(36, 172), 410, 7, TEAL)
	key_hint = label(self, "ENTER: OPEN / ESC: BACK / I: INTEL", Vector2(28, 253), 352, 7, MUTE)
	back_button = key(self, "Back", "BACK", Rect2(28, 225, 44, 20), decline)
	key(self, "Replay", "REPLAY", Rect2(78, 225, 50, 20), replay)
	key(self, "Intel", "INTEL", Rect2(134, 225, 42, 20), show_intel)
	key(self, "Settings", "A11Y", Rect2(182, 225, 52, 20), show_settings)
	next_button = key(self, "Next", "SKIP", Rect2(240, 225, 64, 20), advance_line)
	accept_button = key(self, "Accept", "OPEN LINK", Rect2(310, 225, 142, 20), _primary_action)
	incoming = Control.new()
	incoming.position = Vector2(28, 46)
	incoming.size = Vector2(424, 124)
	incoming.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(incoming)
	label(incoming, "INCOMING TRANSMISSION", Vector2(59, 34), 348, 14, GOLD)
	label(incoming, "FOREST WATCH / OPEN THE SECURE LINK", Vector2(67, 65), 330, 9, TEAL)
	label(incoming, "OBJECTIVES ARE AVAILABLE UNDER INTEL", Vector2(67, 86), 330, 8, MUTE)
	for field in ["sfx", "speech_fx", "voice"]:
		var player := AudioStreamPlayer.new()
		add_child(player)
		set(field, player)
	_build_settings()

func _available() -> bool:
	if kind == "report" or stage == 0:
		return true
	if campaign == null or not campaign.locked() or not campaign.completed.has(stage - 1):
		return false
	return stage != 1 or not campaign.forest.state.launch_resolved or (campaign.forest.state.launch_success and not campaign.completed.has(1))

func _new_project() -> bool:
	return kind != "report" and stage == 0 and campaign != null and campaign.forest.state.launch_resolved

func _load_stage(full_replay: bool) -> void:
	stage_data = data.stages[stage]
	segments = stage_data.segments.duplicate(true)
	if kind == "report":
		var metadata: Dictionary = data.endings.get(report_data.ending, {})
		segments = [
			{"speaker": metadata.get("speaker", "hamdan"), "text": report_data.speech, "expression": metadata.get("expression", "serious"), "intel": "requirements"},
			{"speaker": "aisyah", "text": report_data.tip, "expression": "smile", "intel": "timeline"},
		]
		stage_label.text = report_data.ending + " / MISSION ADDRESS"
		previous_stage.hide()
		next_stage.hide()
		back_button.text = "REPORT"
	else:
		if preferences.seen.has(stage) and stage == 0 and not full_replay:
			segments = segments.filter(func(segment): return segment.speaker != "hamdan")
		stage_label.text = "%02d / %s" % [stage + 1, stage_data.title.to_upper()]
	segment_index = 0
	intel.stage = stage
	intel.view = segments[0].intel
	intel.refresh()
	actor.present(segments[0].speaker, segments[0].expression)
	actor.visible = false
	intel.visible = false
	actor.reduced_motion = preferences.reduced_motion
	intel.reduced_motion = preferences.reduced_motion
	status.text = "INCOMING / SECURE CHANNEL REQUEST"
	subtitle.text = "Connect with the team. Review the objectives at any time."
	accept_button.disabled = not _available()
	accept_button.text = "OPEN LINK" if _available() else "STAGE LOCKED"
	incoming.show()
	_set_power(0)
	_update_speaker_labels()
	if is_instance_valid(dossier):
		dossier.queue_free()
		dossier = null
	queue_redraw()

func _primary_action() -> void:
	if phase == Phase.INCOMING:
		open_link()
	elif phase in [Phase.BOOTING, Phase.REVEALING]:
		skip_animation()
	else:
		accept_mission()

func _cancel_sequence() -> void:
	if sequence != null and sequence.is_valid():
		sequence.kill()
	for player in [sfx, speech_fx, voice]:
		if is_instance_valid(player):
			player.stop()
	if actor != null:
		actor.stop()

func open_link() -> void:
	if phase != Phase.INCOMING:
		return
	_cancel_sequence()
	phase = Phase.BOOTING
	incoming.hide()
	intel.show()
	status.text = "ACQUIRING SIGNAL / KUCHING LINK"
	accept_button.text = "SKIP TO BRIEFING"
	_play("connect")
	scale = Vector2.ONE if preferences.reduced_motion else Vector2(0.965, 0.965)
	sequence = create_tween().set_parallel(true)
	sequence.tween_property(self, "scale", Vector2.ONE, 0.15 if preferences.reduced_motion else 0.7).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	sequence.tween_method(_set_power, 0.0, 1.0, 0.15 if preferences.reduced_motion else 1.0)
	sequence.chain().tween_callback(_reveal)

func _reveal() -> void:
	if phase != Phase.BOOTING:
		return
	phase = Phase.REVEALING
	actor.show()
	actor.modulate = Color("#102b2d")
	status.text = "SIGNAL ACQUIRED / VERIFYING VIDEO"
	sequence = create_tween()
	sequence.tween_property(actor, "modulate", Color.WHITE, 0.12 if preferences.reduced_motion else 0.8)
	sequence.tween_callback(_begin_delivery)

func skip_animation() -> void:
	if phase in [Phase.CLOSED, Phase.AUTHORIZING]:
		return
	_cancel_sequence()
	scale = Vector2.ONE
	_set_power(1)
	incoming.hide()
	actor.modulate = Color.WHITE
	actor.show()
	intel.show()
	_begin_delivery()

func _begin_delivery() -> void:
	phase = Phase.SPEAKING
	_set_segment(segment_index)
	next_button.grab_focus()

func _set_segment(index: int) -> void:
	voice.stop()
	speech_fx.stop()
	segment_index = clampi(index, 0, segments.size() - 1)
	var line: Dictionary = segments[segment_index]
	actor.present(line.speaker, line.expression)
	actor.reduced_motion = preferences.reduced_motion
	shown_chars = 0
	pause_left = 0
	intel.view = line.intel
	intel.refresh()
	_update_speaker_labels()
	status.text = "NEW PROJECT / ACCEPTANCE REPLACES THE SAVED DESIGN" if _new_project() else "SECURE LINK / %s / %02d-%02d" % [data.speakers[line.speaker].channel, segment_index + 1, segments.size()]
	accept_button.text = "VIEW REPORT" if kind == "report" else (("NEW PROJECT" if _new_project() else "ACCEPT MISSION") if _available() else "STAGE LOCKED")
	next_button.text = "NEXT >"
	key_hint.text = "ENTER: NEXT / I: INTEL / R: REPLAY / ESC: BACK"
	if line.has("voice") and ResourceLoader.exists(line.voice):
		voice.stream = load(line.voice)
		voice.volume_db = _volume_db(0)
		voice.play()
	_update_subtitle()

func _update_speaker_labels() -> void:
	var person: Dictionary = data.speakers[segments[segment_index].speaker]
	speaker_label.text = person.name.to_upper()
	role_label.text = person.role.to_upper()

func advance_line() -> void:
	if settings_panel.visible:
		show_settings()
		return
	if is_instance_valid(dossier) and dossier.visible:
		show_intel()
		return
	if phase == Phase.AUTHORIZING:
		_finish_accept()
		return
	if phase != Phase.SPEAKING:
		skip_animation()
		return
	var text: String = segments[segment_index].text
	if shown_chars < text.length():
		shown_chars = text.length()
		voice.stop()
		actor.stop()
		_update_subtitle()
	elif segment_index < segments.size() - 1:
		_play("tick", -5)
		_set_segment(segment_index + 1)
	else:
		status.text = "BRIEFING COMPLETE / REVIEW INTEL OR CONFIRM"
		next_button.text = "READY"
		accept_button.grab_focus()

func replay() -> void:
	if phase in [Phase.CLOSED, Phase.AUTHORIZING]:
		return
	_cancel_sequence()
	_close_overlays()
	phase = Phase.INCOMING
	_load_stage(true)
	skip_animation()

func navigate_stage(direction: int) -> void:
	if kind == "report" or phase in [Phase.CLOSED, Phase.AUTHORIZING]:
		return
	_cancel_sequence()
	_close_overlays()
	stage = posmod(stage + direction, 3)
	phase = Phase.INCOMING
	_load_stage(false)
	if preferences.seen.has(stage) or preferences.reduced_motion:
		skip_animation()
	else:
		_play("incoming")

func accept_mission() -> void:
	if not _available() or phase in [Phase.CLOSED, Phase.AUTHORIZING]:
		return
	if phase in [Phase.INCOMING, Phase.BOOTING, Phase.REVEALING]:
		skip_animation()
	_cancel_sequence()
	_close_overlays()
	phase = Phase.AUTHORIZING
	authorization_clock = 0
	acknowledgment = data.acknowledgments[stage].duplicate()
	if kind == "report":
		acknowledgment = {"speaker": "aisyah", "expression": "sign_off", "text": "Sarawak's sky is waiting."}
	elif _new_project():
		acknowledgment.text = "Starting a new project. We will replace the saved design and meet the crew at the table."
	actor.present(acknowledgment.speaker, acknowledgment.expression)
	actor.reduced_motion = preferences.reduced_motion
	speaker_label.text = data.speakers[acknowledgment.speaker].name.to_upper()
	role_label.text = data.speakers[acknowledgment.speaker].role.to_upper()
	subtitle.text = acknowledgment.text if preferences.subtitles else "AUTHORIZED / HANDING OVER TO THE NEXT SCREEN"
	status.text = "TRANSMISSION COMPLETE" if kind == "report" else "MISSION AUTHORIZED / TEAM HANDOVER"
	for child in get_children():
		if child is Button and child not in [back_button, next_button]:
			child.disabled = true
	accept_button.disabled = true
	next_button.text = "SKIP"
	_play("confirm")
	sequence = create_tween()
	authorization_duration = 0.15 if preferences.reduced_motion else clampf(acknowledgment.text.length() / 44.0, 0.9, 2.8)
	sequence.tween_interval(authorization_duration)
	sequence.tween_callback(func():
		actor.stop()
		_play("shutdown")
	)
	sequence.tween_method(_set_power, 1.0, 0.0, 0.1 if preferences.reduced_motion else 0.35)
	sequence.tween_callback(_finish_accept)

func _finish_accept() -> void:
	if phase != Phase.AUTHORIZING:
		return
	_cancel_sequence()
	phase = Phase.CLOSED
	if kind != "report":
		preferences.mark_seen(stage)
	accepted.emit(stage)

func decline() -> void:
	if phase == Phase.CLOSED:
		return
	_cancel_sequence()
	phase = Phase.CLOSED
	declined.emit()

func _close_overlays() -> void:
	settings_panel.hide()
	for child in get_children():
		if child is Button:
			child.disabled = false
	accept_button.disabled = not _available()
	if is_instance_valid(dossier):
		dossier.hide()
	voice.stream_paused = false
	if subtitle != null:
		subtitle.size.x = 408

func show_intel() -> void:
	if phase in [Phase.CLOSED, Phase.AUTHORIZING]:
		return
	settings_panel.hide()
	if not is_instance_valid(dossier):
		dossier = Panel.new()
		dossier.name = "MissionDossier"
		dossier.position = Vector2(241, 48)
		dossier.size = Vector2(209, 169)
		var style := StyleBoxFlat.new()
		style.bg_color = Color("#102932")
		style.border_color = TEAL
		style.set_border_width_all(1)
		dossier.add_theme_stylebox_override("panel", style)
		add_child(dossier)
		var scroll := ScrollContainer.new()
		dossier_scroll = scroll
		scroll.position = Vector2(7, 6)
		scroll.size = Vector2(196, 157)
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		dossier.add_child(scroll)
		scroll.get_v_scroll_bar().focus_mode = Control.FOCUS_ALL
		var column := VBoxContainer.new()
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_theme_constant_override("separation", 6)
		scroll.add_child(column)
		_dossier_line(column, "MISSION INTELLIGENCE", GOLD)
		if _new_project():
			_dossier_line(column, "NEW PROJECT: accepting replaces your current design and stage progress. Opening or declining changes nothing.", GOLD)
		if kind == "report":
			_dossier_line(column, report_data.headline, WHITE)
			_dossier_line(column, "%s / %d POINTS" % [report_data.grade, report_data.score], TEAL)
		for objective in stage_data.objectives:
			_dossier_line(column, "- " + objective, WHITE)
		_dossier_line(column, "REQUIREMENTS", GOLD)
		var checks: Array = report_data.requirements if kind == "report" else intel.forest.requirements()
		for requirement in checks:
			_dossier_line(column, ("PASS " if requirement.met else "CHECK ") + requirement.label + " / " + str(requirement.value), TEAL if requirement.met else GOLD)
		_dossier_line(column, "WATCH FOR", GOLD)
		for hazard in stage_data.hazards:
			_dossier_line(column, hazard, WHITE)
		_dossier_line(column, "SCHEMATICS / NOT LIVE DATA", MUTE)
		dossier.show()
	else:
		dossier.visible = not dossier.visible
	actor.stop()
	voice.stream_paused = dossier.visible
	incoming.visible = phase == Phase.INCOMING and not dossier.visible
	subtitle.size.x = 190 if dossier.visible else 408
	if dossier.visible:
		dossier_scroll.get_v_scroll_bar().grab_focus()
	else:
		next_button.grab_focus()
	_update_subtitle()

func _dossier_line(parent: Node, value: String, color: Color) -> void:
	var readable := value.replace("≥", ">=").replace("≤", "<=").replace("·", "/")
	var line := label(parent, readable, Vector2.ZERO, 180, 8, color)
	line.custom_minimum_size.x = 180
	line.size_flags_horizontal = Control.SIZE_EXPAND_FILL

func _update_subtitle() -> void:
	if is_instance_valid(dossier) and dossier.visible:
		subtitle.text = ("Link not opened." if phase == Phase.INCOMING else "Live delivery paused.") + "\nReview mission intelligence."
	elif not preferences.subtitles:
		subtitle.text = "CAPTIONS OFF / INTEL HAS OBJECTIVES AND REQUIREMENTS"
	else:
		subtitle.text = segments[segment_index].text.substr(0, int(shown_chars))

func _build_settings() -> void:
	settings_panel = Panel.new()
	settings_panel.name = "TransmissionSettings"
	settings_panel.position = Vector2(92, 54)
	settings_panel.size = Vector2(296, 157)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#152f3b")
	style.border_color = GOLD
	style.set_border_width_all(2)
	settings_panel.add_theme_stylebox_override("panel", style)
	add_child(settings_panel)
	label(settings_panel, "TRANSMISSION SETTINGS", Vector2(12, 10), 272, 9, GOLD)
	speed_button = key(settings_panel, "Speed", "", Rect2(12, 32, 128, 22), _cycle_speed)
	captions_button = key(settings_panel, "Captions", "", Rect2(148, 32, 136, 22), func():
		preferences.subtitles = not preferences.subtitles
		_settings_changed()
	)
	motion_button = key(settings_panel, "Motion", "", Rect2(12, 61, 272, 22), func():
		preferences.reduced_motion = not preferences.reduced_motion
		_settings_changed()
		if preferences.reduced_motion and phase in [Phase.BOOTING, Phase.REVEALING]:
			skip_animation()
	)
	label(settings_panel, "AUDIO", Vector2(12, 96), 66, 8, TEAL)
	volume_slider = HSlider.new()
	volume_slider.min_value = 0
	volume_slider.max_value = 1
	volume_slider.step = 0.05
	volume_slider.value = preferences.volume
	volume_slider.position = Vector2(77, 96)
	volume_slider.size = Vector2(145, 18)
	settings_panel.add_child(volume_slider)
	volume_slider.value_changed.connect(func(value):
		preferences.volume = value
		_settings_changed()
	)
	sound_button = key(settings_panel, "Mute", "", Rect2(230, 90, 54, 22), func():
		preferences.volume = 0.65 if preferences.volume == 0 else 0.0
		volume_slider.value = preferences.volume
		_settings_changed()
	)
	key(settings_panel, "Close", "RETURN TO TRANSMISSION", Rect2(12, 123, 272, 22), show_settings)
	_update_settings_labels()
	settings_panel.hide()

func show_settings() -> void:
	if phase in [Phase.CLOSED, Phase.AUTHORIZING]:
		return
	if is_instance_valid(dossier):
		dossier.hide()
	incoming.visible = phase == Phase.INCOMING
	subtitle.size.x = 408
	settings_panel.visible = not settings_panel.visible
	for child in get_children():
		if child is Button:
			child.disabled = settings_panel.visible
	if not settings_panel.visible:
		accept_button.disabled = not _available()
	voice.stream_paused = settings_panel.visible
	actor.stop()
	if settings_panel.visible:
		speed_button.grab_focus()
	else:
		next_button.grab_focus()
	_update_subtitle()

func _cycle_speed() -> void:
	var speeds := [24.0, 38.0, 65.0, 0.0]
	preferences.characters_per_second = speeds[posmod(speeds.find(preferences.characters_per_second) + 1, speeds.size())]
	_settings_changed()

func _settings_changed() -> void:
	preferences.save()
	actor.reduced_motion = preferences.reduced_motion
	intel.reduced_motion = preferences.reduced_motion
	for player in [sfx, speech_fx, voice]:
		player.volume_db = _volume_db(0)
	_update_settings_labels()
	_update_subtitle()
	queue_redraw()

func _update_settings_labels() -> void:
	speed_button.text = "TEXT: " + ("INSTANT" if preferences.characters_per_second == 0 else "%d CPS" % preferences.characters_per_second)
	captions_button.text = "CAPTIONS: " + ("ON" if preferences.subtitles else "OFF")
	motion_button.text = "REDUCED MOTION: " + ("ON" if preferences.reduced_motion else "OFF")
	sound_button.text = "MUTED" if preferences.volume == 0 else "MUTE"

func _set_power(value: float) -> void:
	power = value
	if effect != null:
		(effect.material as ShaderMaterial).set_shader_parameter("power", value)
	queue_redraw()

func _volume_db(offset: float) -> float:
	return -80.0 if preferences.volume <= 0 else linear_to_db(preferences.volume) - 9.0 + offset

func _play(cue: String, offset := 0.0) -> void:
	if preferences.volume <= 0:
		return
	sfx.stream = load(CUES + cue + ".wav")
	sfx.volume_db = _volume_db(offset)
	sfx.play()

func _process(delta: float) -> void:
	clock += delta
	tick_left = maxf(0, tick_left - delta)
	var shader := effect.material as ShaderMaterial
	shader.set_shader_parameter("clock", clock)
	shader.set_shader_parameter("motion", 0.0 if preferences.reduced_motion else 1.0)
	shader.set_shader_parameter("interference", 0.6 if phase == Phase.BOOTING else (0.25 if phase == Phase.REVEALING else 0.02))
	if phase == Phase.AUTHORIZING:
		authorization_clock += delta
		actor.set_delivery(acknowledgment.text, int(authorization_clock * 44), authorization_clock >= authorization_duration)
	elif phase == Phase.SPEAKING and not settings_panel.visible and not (is_instance_valid(dossier) and dossier.visible):
		var line: Dictionary = segments[segment_index]
		var text: String = line.text
		var before := int(shown_chars)
		if preferences.characters_per_second == 0:
			shown_chars = text.length()
		elif voice.playing and voice.stream != null:
			shown_chars = minf(text.length(), voice.get_playback_position() / maxf(0.01, voice.stream.get_length()) * text.length())
		elif pause_left > 0:
			pause_left -= delta
		else:
			shown_chars = minf(text.length(), shown_chars + delta * preferences.characters_per_second)
		var visible_now := int(shown_chars)
		actor.set_delivery(text, visible_now, visible_now >= text.length())
		if visible_now > before and visible_now > 0:
			var glyph := text.substr(visible_now - 1, 1)
			if glyph in [".", "!", "?", ",", ":", ";"]:
				pause_left = 0.2 if glyph != "," else 0.1
			if tick_left == 0 and actor.mouth_frame > 0 and not voice.playing and preferences.volume > 0:
				speech_fx.stream = load(CUES + "tick.wav")
				speech_fx.volume_db = _volume_db(-13)
				speech_fx.pitch_scale = 0.9 + TransmissionSpeaker.SPEAKERS.find(actor.speaker_id) * 0.055
				speech_fx.play()
				tick_left = 0.18
		if voice.playing and line.has("mouth_cues"):
			for cue in line.mouth_cues:
				if cue.get("time", INF) <= voice.get_playback_position():
					actor.set_mouth_frame(int(cue.get("viseme", 0)))
		_update_subtitle()
	queue_redraw()

func _input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo or phase == Phase.CLOSED:
		return
	if event.keycode == KEY_ESCAPE:
		get_viewport().set_input_as_handled()
		if settings_panel.visible:
			show_settings()
		elif is_instance_valid(dossier) and dossier.visible:
			show_intel()
		else:
			decline()
	elif not settings_panel.visible and event.keycode in [KEY_I, KEY_R]:
		get_viewport().set_input_as_handled()
		if event.keycode == KEY_I:
			show_intel()
		else:
			replay()
	elif not settings_panel.visible and event.keycode in [KEY_LEFT, KEY_RIGHT] and not (get_viewport().gui_get_focus_owner() is Range):
		get_viewport().set_input_as_handled()
		navigate_stage(-1 if event.keycode == KEY_LEFT else 1)
	# Enter/Space use the focused button's normal GUI activation. No global accept.

func _exit_tree() -> void:
	_cancel_sequence()

func _draw() -> void:
	draw_rect(Rect2(-20, -20, 520, 310), Color("#07131dea"))
	var outline := PackedVector2Array([Vector2(14, 27), Vector2(26, 15), Vector2(450, 15), Vector2(466, 31), Vector2(466, 234), Vector2(454, 246), Vector2(26, 246), Vector2(14, 234)])
	draw_colored_polygon(outline, Color("#314b53"))
	draw_polyline(outline + PackedVector2Array([outline[0]]), Color("#779692"), 1)
	draw_line(Vector2(28, 17), Vector2(448, 17), Color("#b3b99a"), 2)
	draw_rect(Rect2(22, 42, 436, 132), Color("#081a24"))
	draw_rect(Rect2(28, 46, 424, 124), Color("#15303c"))
	# Physical video-booth backdrop, with a window and equipment behind the speaker.
	for i in 6:
		draw_rect(Rect2(30, 48 + i * 20, 207, 20), Color("#213e48").lightened(i * 0.008))
	draw_rect(Rect2(42, 67, 65, 63), Color("#112c37"), false)
	draw_rect(Rect2(44, 69, 61, 59), Color("#36595b"))
	for i in 4:
		draw_line(Vector2(45, 80 + i * 12), Vector2(104, 80 + i * 12), Color("#4e706d"))
	draw_rect(Rect2(184, 74, 39, 52), Color("#132e38"))
	for i in 5:
		draw_rect(Rect2(190, 81 + i * 8, 24, 3), Color("#51736e"))
		draw_rect(Rect2(217, 81 + i * 8, 2, 2), GOLD if i == int(clock) % 5 else TEAL.darkened(0.3))
	draw_rect(Rect2(30, 148, 207, 20), Color("#142c36"))
	draw_line(Vector2(30, 148), Vector2(237, 148), Color("#527473"))
	draw_line(Vector2(238, 48), Vector2(238, 168), Color("#6f8d85"))
	draw_rect(Rect2(28, 185, 424, 32), Color("#102934"))
	draw_line(Vector2(28, 185), Vector2(452, 185), Color("#4d6f70"))
	for x in [21, 459]:
		for y in [38, 224]:
			draw_rect(Rect2(x - 2, y - 2, 5, 5), Color("#112633"))
			draw_line(Vector2(x - 1, y), Vector2(x + 1, y), Color("#9eaa97"))
	for y in range(62, 159, 8):
		draw_line(Vector2(456, y), Vector2(461, y), Color("#132d37"), 2)
	var illuminated := phase != Phase.INCOMING or preferences == null or preferences.reduced_motion or int(clock * 3) % 2 == 0
	draw_rect(Rect2(28, 249, 4, 2), GOLD if illuminated else Color("#364b49"))
	for i in 18:
		var level := actor.speech_level if actor != null else 0.0
		var height := 2 + int((0.5 + sin(clock * 10 + i * 1.8) * 0.5) * level * 8)
		draw_rect(Rect2(379 + i * 4, 262 - height, 2, height), TEAL)
