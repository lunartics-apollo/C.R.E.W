class_name StationMap
extends RefCounted
## Collision, rooms, interaction spots, line of sight and pathfinding for the ground station.
## Everything is read from res://data/station_layout.json (shared with scripts/make_world.py).

const LAYOUT_PATH := "res://data/station_layout.json"
const CELL := 8
const LOS_STEP := 6.0
const TREE_TRUNK := Vector2(10, 8)

var size := Vector2i(1280, 960)
var fence := Rect2()
var rooms := {}          # id -> {name, rect: Rect2, floor_rect: Rect2, outer: Rect2}
var doors: Array[Rect2] = []
var door_side: Array[bool] = []   # true = doorway through a vertical wall (walk east-west)
var solids: Array[Rect2] = []   # furniture, props, trees: block movement but not sight
var spots := {}          # id -> {id, name, room, pos: Vector2, effects, verb, icon, hours}
var lamps: Array[Vector2] = []
var grounds := {}         # paths, parking, apron (used by the minimap)
var obstacle_rects: Array[Rect2] = []
var decor: Array = []
var posts := {}          # crew id -> room id where they hang out when the story is idle
var spawns: Array[Vector2] = []
var meeting_table := Rect2()
var rocket_pos := Vector2.ZERO
var props := {}           # name -> {pos, solid}
var trees: Array[Vector2] = []
var astar: AStarGrid2D

static func _rect(a: Array) -> Rect2:
	return Rect2(a[0], a[1], a[2], a[3])

static func _vec(a: Array) -> Vector2:
	return Vector2(a[0], a[1])

func _init() -> void:
	var file := FileAccess.open(LAYOUT_PATH, FileAccess.READ)
	if file == null:
		push_error("StationMap: cannot open %s" % LAYOUT_PATH)
		return
	var data = JSON.parse_string(file.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		push_error("StationMap: %s is not valid JSON" % LAYOUT_PATH)
		return
	_load(data)
	_build_grid()

func _load(data: Dictionary) -> void:
	size = Vector2i(int(data.size[0]), int(data.size[1]))
	fence = _rect(data.fence)
	var wall: float = data.wall
	var face: float = data.face
	for id in data.rooms:
		var r: Dictionary = data.rooms[id]
		var rect := _rect(r.rect)
		rooms[id] = {"name": r.name, "rect": rect, "floor": Color(r.get("floor", "#888888")),
			"floor_rect": Rect2(rect.position + Vector2(0, face), rect.size - Vector2(0, face)),
			"outer": rect.grow(wall)}
	for d in data.doors:
		var r := _rect(d.rect)
		doors.append(r)
		door_side.append(_is_side_door(r, d.between))
	for o in data.obstacles:
		solids.append(_rect(o.rect))
		obstacle_rects.append(_rect(o.rect))
		if o.get("kind", "") == "meeting_table":
			meeting_table = _rect(o.rect)
	var furniture: Array = JSON.parse_string(FileAccess.get_file_as_string("res://assets/interiors/props.json"))
	for item in furniture:
		if item.has("collision"):
			solids.append(_rect(item.collision))
	grounds = data.get("grounds", {})
	for p_name in data.props:
		var p: Dictionary = data.props[p_name]
		props[p_name] = {"pos": _vec(p.pos), "solid": _rect(p.solid)}
		solids.append(_rect(p.solid))
	for t in data.trees:
		var trunk := _vec(t)
		trees.append(trunk)
		solids.append(Rect2(trunk - Vector2(TREE_TRUNK.x / 2, TREE_TRUNK.y), TREE_TRUNK))
	for s in data.spots:
		spots[s.id] = {"id": s.id, "name": s.name, "room": s.room, "pos": _vec(s.pos),
			"effects": s.get("effects", {}), "verb": s.get("verb", ""), "icon": s.get("icon", ""),
			"hours": float(s.get("hours", 0))}
	for l in data.get("lamps", []):
		lamps.append(_vec(l))
		solids.append(Rect2(_vec(l) - Vector2(2, 3), Vector2(4, 4)))
	decor = data.get("decor", [])
	for item in decor:
		if item.has("solid"):
			var w: float = item.solid[0]
			var h: float = item.solid[1]
			solids.append(Rect2(_vec(item.pos) - Vector2(w / 2.0, h), Vector2(w, h)))
	posts = data.posts
	for s in data.spawns:
		spawns.append(_vec(s))
	rocket_pos = _vec(data.rocket)

func _is_side_door(r: Rect2, between: Array) -> bool:
	for id in between:
		if rooms.has(id):
			var room: Rect2 = rooms[id].rect
			return r.get_center().x < room.position.x or r.get_center().x > room.end.x
	return r.size.x > r.size.y

## True when pos is inside the building's walls (or outside the fence): blocks sight and movement.
func is_wall(pos: Vector2) -> bool:
	if not fence.has_point(pos):
		return true
	for door in doors:
		if door.has_point(pos):
			return false
	var in_building := false
	for room in rooms.values():
		if room.floor_rect.has_point(pos):
			return false
		if room.outer.has_point(pos):
			in_building = true
	return in_building

func is_blocked(pos: Vector2) -> bool:
	if is_wall(pos):
		return true
	for solid in solids:
		if solid.has_point(pos):
			return true
	return false

## Room id at pos, or "outside" for the yard around the building.
func room_at(pos: Vector2) -> String:
	for id in rooms:
		if rooms[id].rect.has_point(pos):
			return id
	return "outside"

func room_name(id: String) -> String:
	return rooms[id].name if rooms.has(id) else "OUTSIDE"

func line_of_sight(a: Vector2, b: Vector2) -> bool:
	var dist := a.distance_to(b)
	var steps := int(dist / LOS_STEP)
	for i in range(1, steps):
		if is_wall(a.lerp(b, float(i) / steps)):
			return false
	return true

## A random walkable point inside a room's floor (used for idle wandering).
func random_point_in(room_id: String, rng: RandomNumberGenerator) -> Vector2:
	var area: Rect2 = rooms[room_id].floor_rect.grow(-10) if rooms.has(room_id) else fence.grow(-30)
	for i in 30:
		var p := Vector2(rng.randf_range(area.position.x, area.end.x), rng.randf_range(area.position.y, area.end.y))
		if not is_blocked(p):
			return p
	return area.get_center()

func _build_grid() -> void:
	astar = AStarGrid2D.new()
	astar.region = Rect2i(0, 0, size.x / CELL, size.y / CELL)
	astar.cell_size = Vector2(CELL, CELL)
	astar.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	astar.update()
	for x in astar.region.size.x:
		for y in astar.region.size.y:
			if is_blocked(cell_center(Vector2i(x, y))):
				astar.set_point_solid(Vector2i(x, y))

func cell_center(cell: Vector2i) -> Vector2:
	return Vector2(cell) * CELL + Vector2(CELL, CELL) * 0.5

func _nearest_open_cell(pos: Vector2) -> Vector2i:
	var origin := Vector2i((pos / CELL).floor())
	for radius in 6:
		for dx in range(-radius, radius + 1):
			for dy in range(-radius, radius + 1):
				var c := origin + Vector2i(dx, dy)
				if astar.is_in_boundsv(c) and not astar.is_point_solid(c):
					return c
	return origin

## World-space waypoints from a to b (empty if unreachable).
func find_path(a: Vector2, b: Vector2) -> PackedVector2Array:
	var from := _nearest_open_cell(a)
	var to := _nearest_open_cell(b)
	var cells := astar.get_id_path(from, to)
	var out := PackedVector2Array()
	for c in cells:
		out.append(cell_center(c))
	if not out.is_empty() and not is_blocked(b):
		out[out.size() - 1] = b
	return out
