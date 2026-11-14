extends Control
## Station map overlay (M). With the Security cameras it also shows every crewmate's
## live position, like a security console.

const SCALE := 0.165
const ORIGIN := Vector2(82, 22)

var map: StationMap
var title := "STATION MAP"
var markers: Array = []   # [{pos: Vector2, color: Color, size: float}]

func _init() -> void:
	position = Vector2.ZERO
	size = Vector2(480, 270)
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func show_map(station: StationMap, map_title: String, map_markers: Array) -> void:
	map = station
	title = map_title
	markers = map_markers
	show()
	queue_redraw()

func _to_screen(p: Vector2) -> Vector2:
	return ORIGIN + p * SCALE

func _draw() -> void:
	if map == null:
		return
	var font := PixelFont.font()
	var fs := PixelFont.SIZE
	draw_rect(Rect2(Vector2.ZERO, size), Color("#101418f4"))
	draw_string(font, Vector2(0, 14), title, HORIZONTAL_ALIGNMENT_CENTER, 480, fs, Color("#f2c94c"))
	draw_rect(Rect2(_to_screen(map.fence.position), map.fence.size * SCALE), Color("#4d6b3c"))
	for id in map.rooms:
		var room: Dictionary = map.rooms[id]
		draw_rect(Rect2(_to_screen(room.outer.position), room.outer.size * SCALE), Color("#2a2d30"))
	for id in map.rooms:
		var room: Dictionary = map.rooms[id]
		draw_rect(Rect2(_to_screen(room.rect.position), room.rect.size * SCALE), (room.floor as Color).lightened(0.25))
	for door in map.doors:
		draw_rect(Rect2(_to_screen(door.position), door.size * SCALE), Color("#8d8a80"))
	for id in map.rooms:
		var room: Dictionary = map.rooms[id]
		var center := _to_screen(room.rect.get_center())
		var words: PackedStringArray = room.name.split(" ")
		for w_i in words.size():
			var word_w := font.get_string_size(words[w_i], HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
			var y := (w_i - (words.size() - 1) / 2.0) * 11.0 + 4.0
			draw_string(font, (center + Vector2(-word_w / 2.0, y)).round(), words[w_i], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#1d1a19"))
	draw_circle(_to_screen(map.rocket_pos), 4.0, Color("#e5e0d0"))
	for m in markers:
		draw_circle(_to_screen(m.pos), m.get("size", 2.5), m.color)
	draw_string(font, Vector2(0, 266), "M: close    gold: objective    green: food, rest, healing", HORIZONTAL_ALIGNMENT_CENTER, 480, fs, Color("#c9d6cf"))

func _process(_delta: float) -> void:
	if visible:
		queue_redraw()
