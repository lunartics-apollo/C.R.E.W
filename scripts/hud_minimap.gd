extends Control
## Zoomed corner minimap centred on you. The station is redrawn as clean coloured blocks
## (lawn, paths, walls, room floors, furniture) instead of a blurry shrunk screenshot.
## Crew show as coloured dots; the objective is a pulsing gold square, or a gold arrow on
## the rim when it is out of view.

const SCALE := 0.12
const INK := Color("#1c1622")
const STAR := Color("#f2c94c")
const LAWN := Color("#5f9450")
const PATH := Color("#c9b48a")
const WALL := Color("#241e2c")

var texture: Texture2D
var dots: Array = []          # [{pos, color, is_player, facing}]
var objective := Vector2.INF
var center_world := Vector2.ZERO

func setup(map: StationMap, panel_size: Vector2) -> void:
	size = panel_size
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	texture = ImageTexture.create_from_image(_render(map))

func _render(map: StationMap) -> Image:
	var img := Image.create(ceili(map.size.x * SCALE), ceili(map.size.y * SCALE), false, Image.FORMAT_RGBA8)
	img.fill(Color("#4a7a3f"))
	_fill(img, map.fence, LAWN)
	var g: Dictionary = map.grounds
	for r in g.get("paths", []):
		_fill(img, Rect2(r[0], r[1], r[2], r[3]), PATH)
	if g.has("parking"):
		var p: Array = g.parking
		_fill(img, Rect2(p[0], p[1], p[2] - p[0], p[3] - p[1]), Color("#6d6c6f"))
	if g.has("apron"):
		var a: Array = g.apron
		_fill(img, Rect2(a[0], a[1], a[2] - a[0], a[3] - a[1]), Color("#b9b4a8"))
	for room in map.rooms.values():
		_fill(img, room.outer, WALL)
	for room in map.rooms.values():
		_fill(img, room.floor_rect, room.floor)
	for door in map.doors:
		_fill(img, door, Color("#9a958a"))
	for room in map.rooms.values():
		var face: Rect2 = room.rect
		face.size.y -= room.floor_rect.size.y
		_fill(img, face, Color("#d8cdb8"))
	for r in map.obstacle_rects:
		_fill(img, r, Color("#5a4a40"))
	return img

func _fill(img: Image, r: Rect2, color: Color) -> void:
	var x0 := clampi(floori(r.position.x * SCALE), 0, img.get_width())
	var y0 := clampi(floori(r.position.y * SCALE), 0, img.get_height())
	var x1 := clampi(ceili(r.end.x * SCALE), 0, img.get_width())
	var y1 := clampi(ceili(r.end.y * SCALE), 0, img.get_height())
	if x1 > x0 and y1 > y0:
		img.fill_rect(Rect2i(x0, y0, x1 - x0, y1 - y0), color)

func refresh(crew_dots: Array, objective_pos: Vector2, follow: Vector2) -> void:
	dots = crew_dots
	objective = objective_pos
	center_world = follow
	queue_redraw()

func _to_mini(p: Vector2) -> Vector2:
	return (p * SCALE - center_world * SCALE + size / 2.0).round()

func _draw() -> void:
	if texture:
		draw_texture(texture, _to_mini(Vector2.ZERO))
	for dot in dots:
		if dot.is_player:
			continue
		var p := _to_mini(dot.pos)
		draw_rect(Rect2(p - Vector2(2, 2), Vector2(4, 4)), INK)
		draw_rect(Rect2(p - Vector2(1, 1), Vector2(2, 2)), dot.color)
	_draw_objective()
	for dot in dots:
		if dot.is_player:
			var p := _to_mini(dot.pos)
			draw_rect(Rect2(p - Vector2(3, 3), Vector2(6, 6)), INK)
			draw_rect(Rect2(p - Vector2(2, 2), Vector2(4, 4)), Color.WHITE)
			var tip: Vector2 = p + (dot.facing as Vector2).normalized() * 5.0
			draw_line(p, tip.round(), Color.WHITE, 1.0)

func _draw_objective() -> void:
	if objective == Vector2.INF:
		return
	var o := _to_mini(objective)
	var inner := Rect2(Vector2(4, 4), size - Vector2(8, 8))
	if inner.has_point(o):
		var r := 2.0 + (1.0 if int(Time.get_ticks_msec() / 250) % 2 == 0 else 0.0)
		draw_rect(Rect2(o - Vector2(r + 1, r + 1), Vector2(r * 2 + 2, r * 2 + 2)), INK)
		draw_rect(Rect2(o - Vector2(r, r), Vector2(r * 2, r * 2)), STAR)
		return
	var c := size / 2.0
	var dir := (o - c).normalized()
	var edge := c + dir * minf(absf(inner.size.x / 2.0 / dir.x) if dir.x != 0.0 else INF, absf(inner.size.y / 2.0 / dir.y) if dir.y != 0.0 else INF)
	var side := dir.orthogonal() * 3.0
	draw_colored_polygon(PackedVector2Array([edge + dir * 3.0, edge - dir * 3.0 + side, edge - dir * 3.0 - side]), STAR)
