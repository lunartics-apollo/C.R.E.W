extends SceneTree

func _initialize() -> void:
	call_deferred("run_test")

func run_test() -> void:
	var packed := load("res://scenes/menu.tscn") as PackedScene
	if packed == null:
		printerr("FAIL: main menu scene missing")
		quit(1)
		return
	var scene = packed.instantiate()
	root.add_child(scene)
	current_scene = scene
	await process_frame
	var world = scene.get_node("World")
	var menu = scene.get_node("MenuLayer/Menu")
	assert(not world.is_processing())
	menu._skip_intro()
	assert(menu.get_node("Menu/Play").text == "START MISSION")
	assert(menu.selected_mission == 0)
	assert(menu.get_node("MissionInfo/MissionNumber").text == "01")
	assert(menu.get_node("MissionPrev").size == Vector2(15, 14))
	assert(menu.get_node("MissionStatus").text == "READY")
	assert(menu.get_node("MissionPrev").position.x > menu.get_node("MissionInfo").position.x)
	menu.get_node("MissionNext").pressed.emit()
	assert(menu.selected_mission == 1)
	await create_timer(0.5).timeout
	assert(menu.get_node("MissionInfo/MissionNumber").text == "02")
	assert(menu.get_node("MissionInfo/MissionName").text == "LUNAR RECON")
	menu.get_node("MissionNext").grab_focus()
	var left := InputEventKey.new()
	left.keycode = KEY_LEFT
	left.pressed = true
	menu._input(left)
	assert(menu.selected_mission == 0)
	menu.get_node("MissionNext").pressed.emit()
	await create_timer(0.4).timeout
	assert(menu.selected_mission == 1)
	assert(menu.get_node("MissionInfo/MissionNumber").text == "02")
	menu.get_node("Menu/Options").pressed.emit()
	assert(menu.get_node("OptionsPanel").visible)
	menu.get_node("OptionsPanel/Motion").pressed.emit()
	assert(menu.reduced_motion)
	menu.get_node("OptionsPanel/Quality").pressed.emit()
	assert(menu.low_quality)
	menu.get_node("OptionsPanel/Close").pressed.emit()
	assert(not menu.get_node("OptionsPanel").visible)
	menu.get_node("Menu/Controls").pressed.emit()
	assert(menu.get_node("ControlsPanel").visible)
	menu.get_node("ControlsPanel/Close").pressed.emit()
	assert(not menu.get_node("ControlsPanel").visible)
	menu.get_node("Menu/Play").pressed.emit()
	await create_timer(1.2).timeout
	assert(current_scene == scene)
	assert(world.is_processing())
	assert(world.mission_id == 1)
	assert(not is_instance_valid(scene.get_node_or_null("MenuLayer")))
	scene.queue_free()
	await process_frame
	var second = packed.instantiate()
	root.add_child(second)
	current_scene = second
	await process_frame
	var next_menu = second.get_node("MenuLayer/Menu")
	next_menu._skip_intro()
	next_menu.get_node("Menu/Play").pressed.emit()
	assert(next_menu.starting)
	assert(not second.get_node("World").is_processing())
	var skip := InputEventKey.new()
	skip.keycode = KEY_ESCAPE
	skip.pressed = true
	next_menu._input(skip)
	await process_frame
	assert(second.get_node("World").is_processing())
	assert(second.get_node("World").mission_id == 0)
	print("Menu controls and start transition passed")
	quit()
