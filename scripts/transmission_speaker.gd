class_name TransmissionSpeaker
extends Node2D

const EXPRESSIONS := ["idle", "blink", "talk", "smile", "serious", "surprised", "thinking", "warning", "sign_off"]
const SPEAKERS := ["aisyah", "hamdan", "jabu", "ling", "siti"]

var speaker_id: String = "aisyah"
var expression: String = "idle"
var speaking: bool = false
var mouth_frame: int = 0
var reduced_motion: bool = false:
	set(value):
		reduced_motion = value
		if value and sprite != null:
			sprite.position = Vector2.ZERO
var speech_level: float = 0.0
var sprite: Sprite2D
var _clock: float = 0.0
var _blink_in: float = 3.6
var _blink_left: float = 0.0

func present(id: String, mood: String = "idle") -> void:
	stop()
	if id not in SPEAKERS:
		push_error("Unknown transmission speaker: " + id)
		return
	if sprite == null:
		sprite = Sprite2D.new()
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		sprite.hframes = 4
		sprite.vframes = 9
		add_child(sprite)
	speaker_id = id
	expression = mood if mood in EXPRESSIONS else "idle"
	var path := "res://assets/briefing/cast_%s.png" % id
	sprite.texture = load(path) as Texture2D
	if sprite.texture == null:
		push_error("Missing original transmission cast art: " + path)
	_clock = 0.0
	_blink_left = 0.0
	_blink_in = 3.2 + float(SPEAKERS.find(id)) * 0.3
	_update_frame()

func set_delivery(text: String, visible_characters: int, finished: bool) -> void:
	if finished or visible_characters < 0 or visible_characters >= text.length():
		stop()
		return
	speaking = true
	mouth_frame = 0
	if visible_characters > 0:
		var glyph := text.substr(visible_characters - 1, 1).to_lower()
		# Subtitle-driven mouth shapes are repeatable cues, not recorded voice lip-sync.
		if glyph in ["a", "e"]:
			mouth_frame = 3
		elif glyph in ["o", "u"]:
			mouth_frame = 2
		elif glyph in ["i", "y"]:
			mouth_frame = 1
		elif (glyph.to_upper() != glyph or glyph.is_valid_int()) and glyph not in ["m", "b", "p"]:
			mouth_frame = 1 + visible_characters % 2
	set_mouth_frame(mouth_frame)

func set_mouth_frame(frame: int) -> void:
	# Optional recorded-voice cues can override the subtitle-driven shape.
	mouth_frame = clampi(frame, 0, 3) if speaking else 0
	speech_level = float(mouth_frame) / 3.0
	_update_frame()

func stop() -> void:
	speaking = false
	mouth_frame = 0
	speech_level = 0.0
	if sprite != null:
		sprite.position = Vector2.ZERO
		_update_frame()

func _process(delta: float) -> void:
	if sprite == null:
		return
	_clock += delta
	_blink_in -= delta
	_blink_left = maxf(0.0, _blink_left - delta)
	if _blink_in <= 0.0:
		_blink_left = 0.13
		_blink_in = 3.2 + float(SPEAKERS.find(speaker_id)) * 0.3
	# Pixel-snapped, one-pixel breathing/nodding; the node itself stays anchored.
	sprite.position.y = 0.0 if reduced_motion else roundf(sin(_clock * (3.0 if speaking else 1.3)))
	_update_frame()

func _update_frame() -> void:
	if sprite == null:
		return
	var row: int = EXPRESSIONS.find(expression)
	if _blink_left > 0.0:
		row = EXPRESSIONS.find("blink")
	sprite.frame_coords = Vector2i(clampi(mouth_frame, 0, 3), maxi(row, 0))
