class_name StationScenery
extends Node2D
## Animated props, the rocket and its launch, dust puffs and all sound playback.
## Children are added to the y-sorted world so props overlap the crew correctly.

const PROP_SPRITES := {
	"dish": {"frame": Vector2i(24, 28), "fps": 4.0, "anims": {"sweep": [0, 1, 2, 3]}},
	"workbench": {"frame": Vector2i(32, 24), "fps": 8.0, "anims": {"building": [0, 1, 2, 3], "done": [4]}},
	"fuel_tanks": {"frame": Vector2i(28, 32), "fps": 4.0, "anims": {"vent": [0, 1, 2, 3]}},
}
const ROCKET_SHEET := "res://assets/sprites/rocket_spritesheet.png"
const FLAME_SHEET := "res://assets/sprites/rocket_flame_spritesheet.png"
const ROCKET_FRAME := Vector2i(44, 80)
const FLAME_FRAME := Vector2i(44, 26)
const ROCKET_RISE := 520.0
const SFX_DIR := "res://assets/audio/"
const CUES := {"station_near": -4.0, "denied": -2.0, "mission_control": -2.0, "lab_build": -2.0,
	"launch": 0.0, "mission_complete": 0.0}
const PUFF_COLOR := Color("#e8dcc4")

var world: Node2D
var map: StationMap
var workbench: AnimatedSprite2D
var rocket: AnimatedSprite2D
var rocket_flame: AnimatedSprite2D
var dust_texture: Texture2D
var sfx := {}
var step_players := {}
var rng := RandomNumberGenerator.new()

func build(owner_world: Node2D, station: StationMap) -> void:
	world = owner_world
	map = station
	rng.randomize()
	_make_interior_furniture()
	for prop_name in PROP_SPRITES:
		var sprite := _make_prop(prop_name)
		if prop_name == "workbench":
			workbench = sprite
	_make_rocket()
	_make_audio()
	dust_texture = _make_dust_texture()

func set_workbench_done(done: bool) -> void:
	workbench.play("done" if done else "building")

func _make_interior_furniture() -> void:
	var placements: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/interiors/props.json"))
	var atlas: Texture2D = load("res://assets/interiors/props.png")
	for item in placements:
		var region := AtlasTexture.new()
		region.atlas = atlas
		region.region = Rect2(item.region[0], item.region[1], item.region[2], item.region[3])
		var furniture := Sprite2D.new()
		furniture.name = item.name
		furniture.texture = region
		furniture.centered = false
		furniture.position = Vector2(item.position[0], item.position[1])
		furniture.offset = Vector2(item.offset[0], item.offset[1])
		world.add_child(furniture)

func play(cue: String) -> void:
	if sfx.has(cue):
		sfx[cue].play()

func step(surface: String) -> void:
	if step_players.has(surface):
		step_players[surface].play()

func puff(at: Vector2) -> void:
	if not is_inside_tree():
		return
	var p := Sprite2D.new()
	p.texture = dust_texture
	p.position = at + Vector2(rng.randf_range(-3, 3), 0)
	p.modulate = Color(1, 1, 1, 0.6)
	world.add_child(p)
	var tween := p.create_tween().set_parallel(true)
	tween.tween_property(p, "position:y", at.y - 4.0, 0.35)
	tween.tween_property(p, "modulate:a", 0.0, 0.35)
	tween.tween_property(p, "scale", Vector2(1.6, 1.6), 0.35)
	tween.chain().tween_callback(p.queue_free)

func reset_rocket() -> void:
	rocket.position = map.rocket_pos
	rocket.z_index = 0
	rocket.offset = Vector2(0, 1 - ROCKET_FRAME.y / 2)
	rocket.show()
	rocket.play("standby")
	rocket_flame.hide()

func launch_rocket() -> void:
	rocket.z_index = 5
	rocket_flame.show()
	rocket_flame.play("burn")
	play("launch")
	if not is_inside_tree():
		return
	var base_offset := rocket.offset
	var tween := create_tween()
	tween.tween_method(func(_t: float): rocket.offset = base_offset + Vector2(randi_range(-1, 1), 0), 0.0, 1.0, 1.0)
	tween.tween_callback(func(): rocket.offset = base_offset)
	tween.tween_property(rocket, "position:y", map.rocket_pos.y - ROCKET_RISE, 4.0).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(rocket.hide)

func _make_dust_texture() -> Texture2D:
	var img := Image.create(4, 4, false, Image.FORMAT_RGBA8)
	for y in 4:
		for x in 4:
			if not ((x == 0 or x == 3) and (y == 0 or y == 3)):
				img.set_pixel(x, y, PUFF_COLOR)
	return ImageTexture.create_from_image(img)

func _make_rocket() -> void:
	rocket = AnimatedSprite2D.new()
	rocket.name = "Rocket"
	rocket.sprite_frames = strip_frames(ROCKET_SHEET, ROCKET_FRAME, {"standby": [0, 1]}, 2.0)
	world.add_child(rocket)
	rocket_flame = AnimatedSprite2D.new()
	rocket_flame.sprite_frames = strip_frames(FLAME_SHEET, FLAME_FRAME, {"burn": [0, 1, 2]}, 14.0)
	rocket_flame.centered = false
	rocket_flame.position = Vector2(-ROCKET_FRAME.x / 2, -2)
	rocket_flame.show_behind_parent = true
	rocket.add_child(rocket_flame)
	reset_rocket()

func _make_audio() -> void:
	for cue in CUES:
		var node := AudioStreamPlayer.new()
		node.stream = load(SFX_DIR + cue + ".wav")
		node.volume_db = CUES[cue]
		add_child(node)
		sfx[cue] = node
	for surface in ["grass", "path"]:
		var steps := AudioStreamRandomizer.new()
		steps.random_pitch = 1.12
		steps.random_volume_offset_db = 2.0
		for i in 4:
			steps.add_stream(-1, load("%sstep_%s_%d.wav" % [SFX_DIR, surface, i + 1]))
		var node := AudioStreamPlayer.new()
		node.stream = steps
		node.volume_db = -3.0
		add_child(node)
		step_players[surface] = node

func _make_prop(prop_name: String) -> AnimatedSprite2D:
	var prop: Dictionary = PROP_SPRITES[prop_name]
	var sprite := AnimatedSprite2D.new()
	sprite.name = prop_name.to_pascal_case()
	sprite.sprite_frames = strip_frames("res://assets/sprites/%s_spritesheet.png" % prop_name, prop.frame, prop.anims, prop.fps)
	sprite.offset = Vector2(0, 2 - prop.frame.y / 2)
	sprite.position = map.props[prop_name].pos
	world.add_child(sprite)
	sprite.play(prop.anims.keys()[0])
	return sprite

static func strip_frames(path: String, frame_size: Vector2i, anims: Dictionary, fps: float) -> SpriteFrames:
	var sheet: Texture2D = load(path)
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for anim in anims:
		frames.add_animation(anim)
		frames.set_animation_speed(anim, fps)
		for col in anims[anim]:
			var tex := AtlasTexture.new()
			tex.atlas = sheet
			tex.region = Rect2(Vector2(col * frame_size.x, 0), Vector2(frame_size))
			frames.add_frame(anim, tex)
	return frames
