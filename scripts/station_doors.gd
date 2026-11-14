class_name StationDoors
extends Node2D
## Sliding doors: two metal panels sit in every doorway's wall gap and slide apart when
## anyone walks up. Purely visual (doorways are always walkable), but they make the
## building feel alive.

const OPEN_RANGE := 34.0
const SLIDE_SPEED := 6.0
const PANEL_THICKNESS := 8.0

var doors: Array = []   # [{center: Vector2, horizontal: bool, a: NinePatchRect, b: NinePatchRect, rect: Rect2, open: float}]

func build(map: StationMap) -> void:
	var texture: Texture2D = load("res://assets/ui/door.png")
	for i in map.doors.size():
		var rect: Rect2 = map.doors[i]
		var horizontal: bool = not map.door_side[i]   # panels slide along x when you walk north/south
		var band := _wall_band(map, rect, horizontal)
		if band.size == Vector2.ZERO:
			continue
		var holder := Node2D.new()
		holder.position = Vector2(band.position.x, band.end.y)   # y-sort by the wall's bottom edge
		add_child(holder)
		var panels: Array[NinePatchRect] = []
		for k in 2:
			var p := NinePatchRect.new()
			p.texture = texture
			p.patch_margin_left = 2
			p.patch_margin_right = 2
			p.patch_margin_top = 2
			p.patch_margin_bottom = 2
			p.mouse_filter = Control.MOUSE_FILTER_IGNORE
			holder.add_child(p)
			panels.append(p)
		doors.append({"center": band.get_center(), "horizontal": horizontal, "a": panels[0], "b": panels[1],
			"rect": Rect2(band.position - holder.position, band.size), "open": 0.0})
	_layout_all()

## The part of a doorway that crosses the wall (between two rooms, or room and yard).
func _wall_band(map: StationMap, rect: Rect2, horizontal: bool) -> Rect2:
	var start := -1.0
	var finish := -1.0
	var length := int(rect.size.y if horizontal else rect.size.x)
	for i in length:
		var p := rect.get_center()
		if horizontal:
			p.y = rect.position.y + i + 0.5
		else:
			p.x = rect.position.x + i + 0.5
		var in_room := false
		for room in map.rooms.values():
			if room.rect.has_point(p):
				in_room = true
				break
		if not in_room and map.fence.has_point(p):
			if start < 0.0:
				start = i
			finish = i + 1
	if start < 0.0:
		return Rect2()
	if horizontal:
		var y := rect.position.y + start + (finish - start) / 2.0 - PANEL_THICKNESS / 2.0
		return Rect2(rect.position.x, y, rect.size.x, PANEL_THICKNESS)
	var x := rect.position.x + start + (finish - start) / 2.0 - PANEL_THICKNESS / 2.0
	return Rect2(x, rect.position.y, PANEL_THICKNESS, rect.size.y)

func update_doors(delta: float, people: Array) -> void:
	for door in doors:
		var target := 0.0
		for c in people:
			if c.visible and c.position.distance_to(door.center) < OPEN_RANGE:
				target = 1.0
				break
		door.open = move_toward(door.open, target, delta * SLIDE_SPEED)
	_layout_all()

func _layout_all() -> void:
	for door in doors:
		var r: Rect2 = door.rect
		var amount: float = door.open
		if door.horizontal:
			var half := r.size.x / 2.0 * (1.0 - amount)
			door.a.position = r.position
			door.a.size = Vector2(maxf(half, 2.0), r.size.y)
			door.b.position = Vector2(r.end.x - maxf(half, 2.0), r.position.y)
			door.b.size = door.a.size
		else:
			var half := r.size.y / 2.0 * (1.0 - amount)
			door.a.position = r.position
			door.a.size = Vector2(r.size.x, maxf(half, 2.0))
			door.b.position = Vector2(r.position.x, r.end.y - maxf(half, 2.0))
			door.b.size = door.a.size

func is_open(i: int) -> bool:
	return doors[i].open > 0.5
