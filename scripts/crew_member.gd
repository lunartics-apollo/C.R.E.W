class_name CrewMember
extends Node2D
## One of the four crewmates. Whoever you control walks with the keyboard; the others are
## steered by CrewAI through set_destination(). Movement is snappy: full speed at once,
## stop dead on release, with a bouncy two-frame waddle, a ground shadow and dust puffs.

signal stepped(surface: String, at: Vector2)

const FRAME := Vector2i(20, 26)
const DIRECTIONS := ["down", "up", "right"]  # sheet rows; left is the right row mirrored
const WALK_FPS := 9.0
const STEP_FRAMES := [1, 3]
const SPEED := 92.0
const ARRIVE := 3.0

var index := 0
var info: Dictionary
var id := ""
var map: StationMap
var is_player := false
var facing := Vector2.DOWN
var moving := false
var path := PackedVector2Array()
var busy := false            # holding a use-action; shows the working wiggle
var speed_scale := 1.0       # < 1 when tired

var sprite: AnimatedSprite2D
var bubble: SpeechBubble

func setup(crew_index: int, station: StationMap) -> void:
	index = crew_index
	info = CrewRoster.CREW[crew_index]
	id = info.id
	map = station
	name = info.name.capitalize()

func _ready() -> void:
	sprite = AnimatedSprite2D.new()
	sprite.sprite_frames = _frames(load(CrewRoster.sheet_path(id)))
	sprite.offset = Vector2(0, -FRAME.y / 2 + 1)   # feet sit on the node origin
	add_child(sprite)
	sprite.frame_changed.connect(_on_frame)
	sprite.play("idle_down")
	bubble = SpeechBubble.new()
	bubble.position = Vector2(0, -28)
	add_child(bubble)

func _draw() -> void:
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, 0.4))
	draw_circle(Vector2.ZERO, 7.0, Color(0.08, 0.06, 0.1, 0.35))

func say(text: String, seconds := 3.0) -> void:
	bubble.say(text, seconds)

## Moves by dir at full speed with wall sliding. No acceleration: it stops the moment dir is zero.
func walk(dir: Vector2, delta: float) -> void:
	moving = dir != Vector2.ZERO
	if not moving:
		return
	facing = dir
	var step := dir.normalized() * SPEED * speed_scale * delta
	var next_x := position + Vector2(step.x, 0)
	if not map.is_blocked(next_x):
		position.x = next_x.x
	var next_y := position + Vector2(0, step.y)
	if not map.is_blocked(next_y):
		position.y = next_y.y

func set_destination(target: Vector2) -> void:
	path = map.find_path(position, target)

func has_arrived() -> bool:
	return path.is_empty()

func follow_path(delta: float) -> void:
	if path.is_empty():
		moving = false
		return
	var to_target := path[0] - position
	var step := SPEED * delta
	if to_target.length() <= maxf(ARRIVE, step):
		position = path[0]
		path.remove_at(0)
		moving = not path.is_empty()
		return
	moving = true
	facing = to_target.normalized()
	position += facing * step

func stop() -> void:
	path = PackedVector2Array()
	moving = false

func face(dir: Vector2) -> void:
	if dir != Vector2.ZERO:
		facing = dir

func _process(_delta: float) -> void:
	var dir_name := facing_name(facing)
	var row := "right" if dir_name == "left" else dir_name
	var anim := ("walk_" if moving else "idle_") + row
	if sprite.animation != anim:
		sprite.play(anim)
	sprite.flip_h = dir_name == "left"
	sprite.position.x = (1.0 if int(Time.get_ticks_msec() / 90) % 2 == 0 else -1.0) if busy else 0.0

static func facing_name(dir: Vector2) -> String:
	if absf(dir.x) > absf(dir.y):
		return "left" if dir.x < 0.0 else "right"
	return "up" if dir.y < 0.0 else "down"

func _on_frame() -> void:
	if moving and sprite.animation.begins_with("walk_") and sprite.frame in STEP_FRAMES:
		stepped.emit("grass" if map.room_at(position) == "outside" else "path", position)

func _frames(sheet: Texture2D) -> SpriteFrames:
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for row in DIRECTIONS.size():
		var dir: String = DIRECTIONS[row]
		frames.add_animation("idle_" + dir)
		frames.add_frame("idle_" + dir, cell(sheet, 0, row))
		frames.add_animation("walk_" + dir)
		frames.set_animation_speed("walk_" + dir, WALK_FPS)
		for col in range(1, 5):
			frames.add_frame("walk_" + dir, cell(sheet, col, row))
	return frames

static func cell(sheet: Texture2D, col: int, row: int) -> AtlasTexture:
	var tex := AtlasTexture.new()
	tex.atlas = sheet
	tex.region = Rect2(Vector2(col * FRAME.x, row * FRAME.y), Vector2(FRAME))
	return tex
