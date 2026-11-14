extends Node2D

const SPEED := 76.0
const STATIONS := {
	"MISSION CONTROL": Vector2(225, 255),
	"SPACECRAFT LAB": Vector2(480, 260),
	"LAUNCH PAD": Vector2(735, 270)
}
const MISSION_TEXT := {
	"MISSION CONTROL": "Mission brief received! Build a satellite to observe Earth. Visit the spacecraft lab next.",
	"SPACECRAFT LAB": "Satellite assembled: camera, solar panels and radio are ready. Head to the launch pad!",
	"LAUNCH PAD": "Launch successful! Your satellite is now observing Earth. Mission complete!"
}
# Station the objective marker points at for each stage; stage 3 (done) hides it.
const OBJECTIVE_STATIONS := ["MISSION CONTROL", "SPACECRAFT LAB", "LAUNCH PAD"]
# Sprite sheets drawn in Pixelorama (sources and generator in res://art, ignored by Godot).
const PLAYER_SHEET := "res://assets/sprites/player_spritesheet.png"
const MARKER_SHEET := "res://assets/sprites/marker_spritesheet.png"
const PLAYER_FRAME := Vector2i(16, 24)
const MARKER_FRAME := Vector2i(12, 14)
const PLAYER_DIRECTIONS := ["down", "up", "left", "right"] # sheet row order
const WALK_FPS := 8.0
const MARKER_FPS := 6.0
const MARKER_LIFT := Vector2(0, -34)
# Animated station props, one strip sheet each. "pos" is where the prop's base meets the
# ground; "solid" is the footprint the player can't walk through.
const PROPS := {
	"dish": {"frame": Vector2i(24, 28), "fps": 4.0, "anims": {"sweep": [0, 1, 2, 3]},
		"pos": Vector2(352, 226), "solid": Rect2(343, 216, 18, 10)},
	"workbench": {"frame": Vector2i(32, 24), "fps": 8.0, "anims": {"building": [0, 1, 2, 3], "done": [4]},
		"pos": Vector2(600, 230), "solid": Rect2(586, 218, 28, 10)},
	"fuel_tanks": {"frame": Vector2i(28, 32), "fps": 4.0, "anims": {"vent": [0, 1, 2, 3]},
		"pos": Vector2(858, 226), "solid": Rect2(846, 212, 26, 14)},
}
const SATELLITE_BUILT_STAGE := 2
# Rocket on the launch pad (sprite drawn in Pixelorama); it lifts off when the mission completes.
const ROCKET_SHEET := "res://assets/sprites/rocket_spritesheet.png"
const FLAME_SHEET := "res://assets/sprites/rocket_flame_spritesheet.png"
const ROCKET_FRAME := Vector2i(44, 80)
const FLAME_FRAME := Vector2i(44, 26)
const ROCKET_POS := Vector2(731, 191) # base of the core stage, on the pad
const ROCKET_SHAKE_TIME := 1.0
const ROCKET_RISE := 460.0
const ROCKET_RISE_TIME := 4.0
const JINGLE_DELAY := 4.3
# Sound effects synthesized by art/make_sfx.py.
const SFX_DIR := "res://assets/audio/"
const CUES := {"station_near": -2.0, "denied": 0.0, "mission_control": 0.0, "lab_build": 0.0,
	"launch": 0.0, "mission_complete": 0.0} # cue name -> volume_db
const STEP_VARIANTS := 4
const STEP_VOLUME_DB := -3.0
const STEP_FRAMES := [1, 3] # walk-cycle frames where a foot lands

var player_pos := Vector2(480, 420)
var facing := Vector2.DOWN
var moving := false
var elapsed := 0.0
var stage := 0
var mission_id := 0
var dialogue := "Welcome to C.R.E.W! Walk to Mission Control to begin."
var message_time := 12.0
var player: AnimatedSprite2D
var marker: AnimatedSprite2D
var workbench: AnimatedSprite2D
var rocket: AnimatedSprite2D
var rocket_flame: AnimatedSprite2D
var ground_image: Image
var sfx := {} # cue name -> AudioStreamPlayer; empty until _ready (tests call _interact without it)
var step_players := {} # "grass" / "path" -> AudioStreamPlayer
var last_station := ""
var camera: Camera2D
var prompt: Label
var message: Label
var objective: Label
var clock_label: Label
var message_panel: PanelContainer

func set_mission(value: int) -> void:
	mission_id = clampi(value, 0, 1)
	dialogue = "Welcome to C.R.E.W! Your " + ("Earth observation" if mission_id == 0 else "lunar reconnaissance") + " mission starts at Mission Control."
	message_time = 12.0

func station_at(pos: Vector2) -> String:
	for station in STATIONS:
		if pos.distance_to(STATIONS[station]) < 37.0:
			return station
	return ""

func is_blocked(pos: Vector2) -> bool:
	if pos.x < 18 or pos.x > 942 or pos.y < 25 or pos.y > 620:
		return true
	for prop in PROPS.values():
		if prop.solid.has_point(pos):
			return true
	return Rect2(136, 112, 178, 120).has_point(pos) or Rect2(391, 116, 178, 120).has_point(pos) or Rect2(655, 133, 168, 91).has_point(pos)

func _ready() -> void:
	var ground := Sprite2D.new()
	ground.texture = load("res://assets/space_center.png")
	ground.centered = false
	add_child(ground)
	ground_image = ground.texture.get_image()
	y_sort_enabled = true # the player passes behind props when standing above them
	for prop_name in PROPS:
		var sprite := _make_prop(prop_name)
		if prop_name == "workbench":
			workbench = sprite
	_make_rocket()
	_make_audio()
	marker = AnimatedSprite2D.new()
	marker.sprite_frames = _strip_frames(MARKER_SHEET, MARKER_FRAME, {"bob": [0, 1, 2, 3]}, MARKER_FPS)
	marker.z_index = 1
	add_child(marker)
	marker.play("bob")
	player = AnimatedSprite2D.new()
	player.sprite_frames = _player_frames()
	player.offset = Vector2(0, -10) # feet sit on the node origin
	add_child(player)
	player.frame_changed.connect(_on_player_frame)
	camera = Camera2D.new()
	add_child(camera)
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = 960
	camera.limit_bottom = 640
	_make_ui()
	_update_view()

func _process(delta: float) -> void:
	elapsed += delta
	message_time = maxf(0.0, message_time - delta)
	var dir := Vector2(float(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) - float(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT)), float(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) - float(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP))).normalized()
	moving = dir != Vector2.ZERO
	if moving:
		facing = dir
		var next_x := player_pos + Vector2(dir.x * SPEED * delta, 0)
		var next_y := player_pos + Vector2(0, dir.y * SPEED * delta)
		if not is_blocked(next_x): player_pos.x = next_x.x
		if not is_blocked(next_y): player_pos.y = next_y.y
	_update_view()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode in [KEY_E, KEY_SPACE, KEY_ENTER]:
		_interact()

func _interact() -> void:
	var station := station_at(player_pos)
	var cue := "denied"
	if station == "":
		dialogue = "Walk closer to a station and press E."
	elif station == "MISSION CONTROL":
		stage = maxi(stage, 1)
		dialogue = MISSION_TEXT[station] if mission_id == 0 else "Mission brief received! Prepare a probe to map the Moon. Visit the spacecraft lab next."
		cue = "mission_control"
	elif station == "SPACECRAFT LAB":
		if stage < 1:
			dialogue = "Visit Mission Control first to choose your mission."
		else:
			stage = maxi(stage, 2)
			dialogue = MISSION_TEXT[station]
			cue = "lab_build"
	elif stage < 2:
		dialogue = "Your spacecraft isn't ready yet. Visit the workshop first."
	else:
		var first_launch := stage < 3
		stage = 3
		dialogue = MISSION_TEXT[station] if mission_id == 0 else "Launch successful! Your probe is on its way to map the Moon. Mission complete!"
		cue = "launch" if first_launch else "mission_complete"
		if first_launch:
			_launch_rocket()
	message_time = 8.0
	_play(cue)

func _update_view() -> void:
	player.position = player_pos.round()
	var anim := ("walk_" if moving else "idle_") + facing_name(facing)
	if player.animation != anim:
		player.play(anim)
	marker.visible = stage < OBJECTIVE_STATIONS.size()
	if marker.visible:
		marker.position = STATIONS[OBJECTIVE_STATIONS[stage]] + MARKER_LIFT
	var bench_anim := "done" if stage >= SATELLITE_BUILT_STAGE else "building"
	if workbench.animation != bench_anim:
		workbench.play(bench_anim)
	camera.position = player_pos.round()
	var station := station_at(player_pos)
	if station != last_station:
		if station != "":
			_play("station_near")
		last_station = station
	prompt.text = "[E]  " + station if station != "" else "WASD / Arrows: move    E: interact"
	message.text = dialogue
	message_panel.visible = message_time > 0.0
	objective.text = ["1 / 3  Visit mission control", "2 / 3  Build your satellite", "3 / 3  Visit the launch pad", "MISSION COMPLETE  ✦"][stage]
	var minutes := int(elapsed * 3.0) + 8 * 60
	clock_label.text = "DAY %d    %02d:%02d" % [1 + minutes / 1440, (minutes / 60) % 24, minutes % 60]

func _make_ui() -> void:
	var layer := CanvasLayer.new()
	layer.name = "HUD"
	add_child(layer)
	var panel := ColorRect.new()
	panel.color = Color('#343b3ce8')
	panel.position = Vector2(8, 8)
	panel.size = Vector2(213, 36)
	layer.add_child(panel)
	objective = _label(layer, Vector2(15, 11), 11, Color('#fff0c9'))
	clock_label = _label(layer, Vector2(15, 26), 9, Color('#b9ddbc'))
	prompt = _label(layer, Vector2(10, 247), 10, Color('#fff2d0'))
	var footer := ColorRect.new()
	footer.color = Color('#343b3cde')
	footer.position = Vector2(5, 243)
	footer.size = Vector2(300, 20)
	layer.add_child(footer)
	layer.move_child(footer, prompt.get_index())
	message_panel = PanelContainer.new()
	message_panel.position = Vector2(8, 194)
	message_panel.size = Vector2(464, 43)
	var style := StyleBoxFlat.new()
	style.bg_color = Color('#fff0c9')
	style.set_border_width_all(2)
	style.border_color = Color('#74564b')
	style.set_content_margin_all(6)
	message_panel.add_theme_stylebox_override('panel', style)
	layer.add_child(message_panel)
	message = Label.new()
	message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	message.add_theme_font_size_override('font_size', 11)
	message.add_theme_color_override('font_color', Color('#4e403b'))
	message_panel.add_child(message)

func _label(parent: Node, pos: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.position = pos
	label.add_theme_font_size_override('font_size', font_size)
	label.add_theme_color_override('font_color', color)
	parent.add_child(label)
	return label

func facing_name(dir: Vector2) -> String:
	if absf(dir.x) > absf(dir.y):
		return "left" if dir.x < 0.0 else "right"
	return "up" if dir.y < 0.0 else "down"

func _player_frames() -> SpriteFrames:
	var sheet: Texture2D = load(PLAYER_SHEET)
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for row in PLAYER_DIRECTIONS.size():
		var dir: String = PLAYER_DIRECTIONS[row]
		frames.add_animation("walk_" + dir)
		frames.set_animation_speed("walk_" + dir, WALK_FPS)
		for col in 4:
			frames.add_frame("walk_" + dir, _cell(sheet, PLAYER_FRAME, col, row))
		frames.add_animation("idle_" + dir)
		frames.add_frame("idle_" + dir, _cell(sheet, PLAYER_FRAME, 0, row))
	return frames

func _make_rocket() -> void:
	rocket = AnimatedSprite2D.new()
	rocket.name = "Rocket"
	rocket.sprite_frames = _strip_frames(ROCKET_SHEET, ROCKET_FRAME, {"standby": [0, 1]}, 2.0)
	rocket.offset = Vector2(0, 1 - ROCKET_FRAME.y / 2) # bottom row sits on the node origin
	rocket.position = ROCKET_POS
	add_child(rocket)
	rocket.play("standby")
	rocket_flame = AnimatedSprite2D.new()
	rocket_flame.sprite_frames = _strip_frames(FLAME_SHEET, FLAME_FRAME, {"burn": [0, 1, 2]}, 14.0)
	rocket_flame.centered = false
	rocket_flame.position = Vector2(-ROCKET_FRAME.x / 2, -2) # plumes start at the engine bells
	rocket_flame.show_behind_parent = true
	rocket_flame.hide()
	rocket.add_child(rocket_flame)

# Ignition shudder, then an accelerating climb out of view; the jingle lands as it leaves.
func _launch_rocket() -> void:
	if rocket == null:
		return
	rocket.z_index = 2
	rocket_flame.show()
	rocket_flame.play("burn")
	var base_offset := rocket.offset
	var tween := create_tween()
	tween.tween_method(func(_t: float): rocket.offset = base_offset + Vector2(randi_range(-1, 1), 0), 0.0, 1.0, ROCKET_SHAKE_TIME)
	tween.tween_callback(func(): rocket.offset = base_offset)
	tween.tween_property(rocket, "position:y", ROCKET_POS.y - ROCKET_RISE, ROCKET_RISE_TIME).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(rocket.hide)
	create_tween().tween_callback(_play.bind("mission_complete")).set_delay(JINGLE_DELAY)

func _make_audio() -> void:
	for cue in CUES:
		var player_node := AudioStreamPlayer.new()
		player_node.stream = load(SFX_DIR + cue + ".wav")
		player_node.volume_db = CUES[cue]
		add_child(player_node)
		sfx[cue] = player_node
	for surface in ["grass", "path"]:
		var steps := AudioStreamRandomizer.new()
		steps.random_pitch = 1.12
		steps.random_volume_offset_db = 2.0
		for i in STEP_VARIANTS:
			steps.add_stream(-1, load("%sstep_%s_%d.wav" % [SFX_DIR, surface, i + 1]))
		var step_node := AudioStreamPlayer.new()
		step_node.stream = steps
		step_node.volume_db = STEP_VOLUME_DB
		add_child(step_node)
		step_players[surface] = step_node

func _play(cue: String) -> void:
	if sfx.has(cue):
		sfx[cue].play()

func _on_player_frame() -> void:
	if moving and player.animation.begins_with("walk_") and player.frame in STEP_FRAMES:
		step_players[surface_at(player_pos)].play()

# Dirt paths are tan (red > green) in the background art; everything walkable else is grass.
func surface_at(pos: Vector2) -> String:
	if ground_image == null:
		return "grass"
	var p := Vector2i(pos.round()).clamp(Vector2i.ZERO, ground_image.get_size() - Vector2i.ONE)
	var c := ground_image.get_pixelv(p)
	return "path" if c.r > c.g else "grass"

func _make_prop(prop_name: String) -> AnimatedSprite2D:
	var prop: Dictionary = PROPS[prop_name]
	var sheet_path := "res://assets/sprites/%s_spritesheet.png" % prop_name
	var sprite := AnimatedSprite2D.new()
	sprite.name = prop_name.to_pascal_case()
	sprite.sprite_frames = _strip_frames(sheet_path, prop.frame, prop.anims, prop.fps)
	# Each sheet ends in a 2px ground shadow; sit that shadow on the node origin.
	sprite.offset = Vector2(0, 2 - prop.frame.y / 2)
	sprite.position = prop.pos
	add_child(sprite)
	sprite.play(prop.anims.keys()[0])
	return sprite

# Builds SpriteFrames from a single-row sheet; anims maps names to frame columns.
func _strip_frames(path: String, size: Vector2i, anims: Dictionary, fps: float) -> SpriteFrames:
	var sheet: Texture2D = load(path)
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for anim in anims:
		frames.add_animation(anim)
		frames.set_animation_speed(anim, fps)
		for col in anims[anim]:
			frames.add_frame(anim, _cell(sheet, size, col, 0))
	return frames

func _cell(sheet: Texture2D, size: Vector2i, col: int, row: int) -> AtlasTexture:
	var tex := AtlasTexture.new()
	tex.atlas = sheet
	tex.region = Rect2(Vector2(col * size.x, row * size.y), Vector2(size))
	return tex
