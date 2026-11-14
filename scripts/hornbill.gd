extends Node2D
## Small project-drawn hornbill motif, independent of the world camera.
var elapsed := 0.0

func _ready() -> void:
	z_index = 20
	position = Vector2(-20, 60)

func _process(delta: float) -> void:
	elapsed += delta
	position = Vector2(-20 + elapsed * 78, 60 + sin(elapsed * 1.6) * 9)
	queue_redraw()
	if elapsed > 7:
		queue_free()

func _draw() -> void:
	var wing := -5.0 if sin(elapsed * 12) > 0 else 4.0
	draw_colored_polygon(PackedVector2Array([Vector2(0, 1), Vector2(-11, wing), Vector2(4, -1)]), Color("#172630"))
	draw_rect(Rect2(-3, -1, 10, 4), Color("#172630"))
	draw_rect(Rect2(-7, 1, 5, 2), Color("#fff4dc"))
	draw_rect(Rect2(5, -3, 4, 5), Color("#172630"))
	draw_colored_polygon(PackedVector2Array([Vector2(8, -2), Vector2(17, 0), Vector2(8, 1)]), Color("#e6b65e"))
	draw_rect(Rect2(8, -4, 5, 2), Color("#d18042"))
	draw_rect(Rect2(7, -2, 1, 1), Color.WHITE)
