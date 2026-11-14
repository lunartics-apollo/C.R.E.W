class_name SpeechBubble
extends Node2D
## Pixel speech bubble that pops up above a character, then hides itself.

const MAX_WIDTH := 120.0
const PAD := Vector2(5, 3)

var frame: NinePatchRect
var tail: Sprite2D
var label: Label
var time_left := 0.0

func _ready() -> void:
	z_index = 20
	frame = NinePatchRect.new()
	frame.texture = load("res://assets/ui/bubble.png")
	frame.patch_margin_left = 4
	frame.patch_margin_right = 4
	frame.patch_margin_top = 4
	frame.patch_margin_bottom = 4
	add_child(frame)
	tail = Sprite2D.new()
	tail.texture = load("res://assets/ui/bubble_tail.png")
	tail.centered = false
	tail.position = Vector2(-3, -1)
	add_child(tail)
	label = Label.new()
	label.theme = PixelFont.theme()
	label.add_theme_color_override("font_color", Color("#2a2230"))
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	frame.add_child(label)
	hide()

func say(text: String, seconds := 3.0) -> void:
	label.text = text
	label.custom_minimum_size = Vector2.ZERO
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	var natural := label.get_minimum_size().x
	var width := minf(natural, MAX_WIDTH)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size.x = width
	label.size = Vector2(width, 0)
	var height := label.get_minimum_size().y
	label.position = PAD
	frame.size = Vector2(width, height) + PAD * 2
	frame.position = Vector2(-frame.size.x / 2.0, -frame.size.y)
	time_left = seconds
	scale = Vector2(0.6, 0.6)
	show()
	create_tween().tween_property(self, "scale", Vector2.ONE, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func _process(delta: float) -> void:
	if not visible:
		return
	time_left -= delta
	if time_left <= 0.0:
		hide()
