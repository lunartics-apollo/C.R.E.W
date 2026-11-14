class_name NightLights
extends Node2D
## Warm room lights and lamp posts that switch on as the CanvasModulate darkens.
## They're PointLight2Ds, so they brighten the tinted world without touching the HUD.

const ROOM_COLOR := Color("#ffe2a8")
const LAMP_COLOR := Color("#fff1b8")
const ROOM_ENERGY := 0.9
const LAMP_ENERGY := 1.0

var lights: Array[PointLight2D] = []
var base_energy: Array[float] = []

func build(map: StationMap) -> void:
	var texture: Texture2D = load("res://assets/ui/light.png")
	for room in map.rooms.values():
		var r: Rect2 = room.floor_rect
		var reach := maxf(r.size.x, r.size.y) * 1.25
		_add(texture, r.get_center(), reach / 64.0, ROOM_COLOR, ROOM_ENERGY)
	for lamp in map.lamps:
		_add(texture, lamp + Vector2(0, -6), 1.6, LAMP_COLOR, LAMP_ENERGY)

func _add(texture: Texture2D, pos: Vector2, scale_factor: float, color: Color, energy: float) -> void:
	var light := PointLight2D.new()
	light.texture = texture
	light.position = pos
	light.texture_scale = scale_factor
	light.color = color
	light.energy = 0.0
	light.blend_mode = Light2D.BLEND_MODE_ADD
	add_child(light)
	lights.append(light)
	base_energy.append(energy)

## darkness: 0 in daylight, 1 at full night.
func set_darkness(darkness: float) -> void:
	for i in lights.size():
		lights[i].energy = base_energy[i] * clampf(darkness, 0.0, 1.0)
		lights[i].visible = darkness > 0.02
