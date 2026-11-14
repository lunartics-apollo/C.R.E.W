class_name CrewAI
extends RefCounted
## Brain for a crewmate you aren't controlling. They walk to wherever the current story
## beat needs them; otherwise they potter around their home room and chat now and then.

const THINK_EVERY := 0.5
const IDLE_PAUSE := Vector2(3.0, 8.0)
const CHAT_GAP := Vector2(10.0, 22.0)
const CHAT_RANGE := 150.0

var me: CrewMember
var world: Node
var rng := RandomNumberGenerator.new()
var think_timer := 0.0
var idle_timer := 0.0
var chat_timer := 0.0
var goal := ""             # spot or room id the story wants us at ("" = free time)

func _init(member: CrewMember, game_world: Node, seed_value: int) -> void:
	me = member
	world = game_world
	rng.seed = seed_value
	chat_timer = rng.randf_range(CHAT_GAP.x, CHAT_GAP.y)

func update(delta: float) -> void:
	think_timer -= delta
	if think_timer <= 0.0:
		think_timer = THINK_EVERY
		_think()
	me.follow_path(delta)
	if me.has_arrived() and world.map.spots.has(goal):
		me.face(Vector2.UP)
	_chatter(delta)

## The story changed where this crewmate should be.
func set_goal(target: String) -> void:
	if target == goal:
		return
	goal = target
	idle_timer = 0.0
	_go_to_goal()

func _go_to_goal() -> void:
	if goal == "":
		return
	if world.map.spots.has(goal):
		me.set_destination(world.map.spots[goal].pos + Vector2(0, 10))
	elif world.map.room_at(me.position) != goal:
		me.set_destination(world.map.random_point_in(goal, rng))

func _think() -> void:
	if not me.has_arrived():
		return
	idle_timer -= THINK_EVERY
	if idle_timer > 0.0:
		return
	idle_timer = rng.randf_range(IDLE_PAUSE.x, IDLE_PAUSE.y)
	if world.map.spots.has(goal):
		return  # stay put at the story spot
	var room: String = goal if goal != "" else world.map.posts.get(me.id, "mess_hall")
	me.set_destination(world.map.random_point_in(room, rng))

func _chatter(delta: float) -> void:
	chat_timer -= delta
	if chat_timer > 0.0:
		return
	chat_timer = rng.randf_range(CHAT_GAP.x, CHAT_GAP.y)
	var lines: Array = world.story.chatter_for(me.id)
	if lines.is_empty() or me.position.distance_to(world.player.position) > CHAT_RANGE:
		return
	me.say(lines[rng.randi_range(0, lines.size() - 1)], 3.0)
