extends SceneTree

var elapsed := 0.0
var measured := 0.0
var frames := 0
var slow_frames := 0

func _initialize() -> void:
	root.add_child(load('res://scenes/menu.tscn').instantiate())

func _process(delta: float) -> bool:
	elapsed += delta
	if elapsed > 1.0:
		frames += 1
		measured += delta
		if delta > 1.0 / 30.0:
			slow_frames += 1
	if elapsed >= 6.0:
		print('Menu sample: %.1f FPS average, %d frames slower than 30 FPS over %.1f seconds' % [frames / measured, slow_frames, measured])
		quit()
	return false
