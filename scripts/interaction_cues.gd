class_name InteractionCues
extends Node2D
## World-space feedback so the player always knows what they can do:
## pulsing corner brackets on whatever is in reach (gold = story, white = optional,
## red = locked), a "!" over the crewmate the story wants you to talk to, a bouncing
## arrow over the objective spot, a work bar above your head while holding E, and
## floating "+35 ENERGY" text.

const GOLD := Color("#f2c94c")
const WHITE := Color("#fff4dc")
const RED := Color("#e5604d")
const INK := Color("#1c1622")
const BAR_SIZE := Vector2(22, 4)

var focus_pos := Vector2.INF
var focus_size := Vector2(18, 18)
var focus_color := WHITE
var hold_pos := Vector2.INF
var hold_ratio := 0.0
var exclaim: Sprite2D
var arrow: Sprite2D

func _ready() -> void:
	z_index = 40
	exclaim = Sprite2D.new()
	exclaim.texture = load("res://assets/ui/icons/exclaim.png")
	add_child(exclaim)
	arrow = Sprite2D.new()
	arrow.texture = load("res://assets/ui/arrow.png")
	add_child(arrow)

func show_focus(pos: Vector2, size: Vector2, color: Color) -> void:
	focus_pos = pos
	focus_size = size
	focus_color = color

func clear_focus() -> void:
	focus_pos = Vector2.INF

func show_hold(pos: Vector2, ratio: float) -> void:
	hold_pos = pos
	hold_ratio = ratio

func clear_hold() -> void:
	hold_pos = Vector2.INF

## Points at the objective: a "!" over a person, an arrow over a place, or nothing.
func point_at(pos: Vector2, is_person: bool) -> void:
	var bob := roundf(sin(Time.get_ticks_msec() / 180.0) * 2.0)
	exclaim.visible = pos != Vector2.INF and is_person
	arrow.visible = pos != Vector2.INF and not is_person
	if exclaim.visible:
		exclaim.position = pos + Vector2(0, -40 + bob)
	if arrow.visible:
		arrow.position = pos + Vector2(0, -34 + bob)

func float_text(pos: Vector2, text: String, color: Color) -> void:
	var label := Label.new()
	label.theme = PixelFont.theme()
	label.text = text
	label.add_theme_color_override("font_color", color)
	label.add_theme_color_override("font_outline_color", INK)
	label.add_theme_constant_override("outline_size", 2)
	label.position = pos + Vector2(-label.get_minimum_size().x / 2.0, -44)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)
	var tween := label.create_tween().set_parallel(true)
	tween.tween_property(label, "position:y", label.position.y - 16.0, 1.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(label, "modulate:a", 0.0, 0.5).set_delay(0.8)
	tween.chain().tween_callback(label.queue_free)

func _process(_delta: float) -> void:
	queue_redraw()

func _draw() -> void:
	if focus_pos != Vector2.INF:
		var pulse := 2.0 + roundf(sin(Time.get_ticks_msec() / 150.0) * 1.5)
		var half := focus_size / 2.0 + Vector2(pulse, pulse)
		var c := focus_pos
		for sx in [-1.0, 1.0]:
			for sy in [-1.0, 1.0]:
				var corner := c + Vector2(half.x * sx, half.y * sy)
				_bracket(corner, Vector2(-sx, -sy))
	if hold_pos != Vector2.INF:
		var top_left := hold_pos + Vector2(-BAR_SIZE.x / 2.0, -38)
		draw_rect(Rect2(top_left - Vector2.ONE, BAR_SIZE + Vector2(2, 2)), INK)
		draw_rect(Rect2(top_left, BAR_SIZE), Color("#3a3446"))
		draw_rect(Rect2(top_left, Vector2(roundf(BAR_SIZE.x * clampf(hold_ratio, 0.0, 1.0)), BAR_SIZE.y)), GOLD)

func _bracket(corner: Vector2, inward: Vector2) -> void:
	var arm := 4.0
	for offset in [Vector2(1, 1), Vector2.ZERO]:   # dark shadow first, then the colour
		var col: Color = INK if offset != Vector2.ZERO else focus_color
		var p: Vector2 = corner + offset
		draw_line(p, p + Vector2(inward.x * arm, 0), col, 1.0)
		draw_line(p, p + Vector2(0, inward.y * arm), col, 1.0)
