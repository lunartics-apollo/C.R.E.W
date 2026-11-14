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
	world.campaign = Campaign.new("user://menu_campaign_test.json")
	world.campaign.character = -1
	world.campaign.completed.clear()
	world.campaign.forest.reset()
	world.campaign.beats.clear()
	menu.presentation = BriefingSettings.new("user://menu_transmission_test.cfg")
	menu.presentation.seen.clear()
	menu.presentation.reduced_motion = false
	menu.reduced_motion = false
	menu.selected_mission = 0
	menu._change_mission(0)
	assert(not world.is_processing())
	menu._skip_intro()
	assert(menu.get_node("Menu/Play").text == "LET EXPLORE")
	assert(menu.selected_mission == 0)
	assert(menu.get_node("MissionInfo/MissionNumber").text == "01")
	assert(menu.get_node("MissionPrev").size == Vector2(15, 14))
	assert(menu.get_node("MissionStatus").text == "READY")
	assert(menu.get_node("MissionPrev").position.x > menu.get_node("MissionInfo").position.x)
	menu.get_node("MissionNext").pressed.emit()
	assert(menu.selected_mission == 1)
	await create_timer(0.5).timeout
	assert(menu.get_node("MissionInfo/MissionNumber").text == "02")
	assert(menu.get_node("MissionInfo/MissionName").text == "REVIEW & LAUNCH")
	assert(menu.play_button.disabled, "Finish Design before opening Review")
	world.campaign.character = 0
	world.campaign.completed.assign([0])
	assert(world.campaign.forest.launch(0).success)
	menu._change_mission(0)
	assert(not menu.play_button.disabled, "A successful launch can resume until stage completion is saved")
	menu._change_mission(-1)
	var launched := JSON.stringify(world.campaign.forest.state)
	menu._start_mission()
	assert(world.campaign.forest.state.launch_resolved, "New Project previews must not reset a launched design")
	menu.transmission.skip_animation()
	assert(menu.transmission.accept_button.text == "NEW PROJECT", "Resetting a design is clearly labelled even inside the monitor")
	menu.transmission.decline()
	assert(JSON.stringify(world.campaign.forest.state) == launched and world.campaign.completed == [0], "Decline keeps the completed project intact")
	world.campaign.character = -1
	world.campaign.completed.clear()
	world.campaign.forest.reset()
	menu._change_mission(1)
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
	menu._change_mission(-1)
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
	assert(is_instance_valid(menu.transmission))
	assert(not is_instance_valid(menu.preflight))
	var before := JSON.stringify(world.campaign.forest.state)
	menu.transmission.decline()
	assert(not is_instance_valid(menu.transmission))
	assert(JSON.stringify(world.campaign.forest.state) == before, "Declining is presentation-only")
	assert(not world.is_processing())
	menu.get_node("Menu/Play").pressed.emit()
	menu.transmission.skip_animation()
	menu.transmission.accept_mission()
	await create_timer(0.4).timeout
	assert(is_instance_valid(menu.preflight))
	assert(not world.is_processing(), "The briefing pauses the world")
	for member in world.characters:
		assert(world.map.room_at(member.position) == "mess_hall", "The briefing gathers the real crew in the Mess Hall")
		assert(not world.map.is_blocked(member.position), "Meeting positions are walkable")
	assert(menu.preflight.lines.size() == 5)
	while not menu.preflight.selecting:
		menu.preflight.dialogue.visible_characters = -1
		menu.preflight.advance()
	assert(menu.preflight.profile.get_node("FullBody").texture != null)
	menu.preflight.crew_buttons[1].grab_focus()
	var choose := InputEventKey.new()
	choose.keycode = KEY_ENTER
	choose.pressed = true
	menu.preflight._input(choose)
	assert(menu.preflight.selected == 1)
	assert(world.campaign.character == -1, "Enter on a crew tab previews instead of locking a different character")
	menu.preflight._select(2)
	menu.preflight._confirm()
	await create_timer(1.2).timeout
	assert(current_scene == scene)
	assert(world.is_processing())
	assert(world.mission_id == 0)
	assert(world.player.id == "juno")
	assert(world.map.room_at(world.player.position) == "mess_hall", "Selected character begins beside the Mess Hall table")
	assert(not is_instance_valid(scene.get_node_or_null("MenuLayer")))
	scene.queue_free()
	await process_frame
	var second = packed.instantiate()
	root.add_child(second)
	current_scene = second
	await process_frame
	var next_menu = second.get_node("MenuLayer/Menu")
	next_menu.presentation = BriefingSettings.new("user://menu_transmission_test.cfg")
	second.get_node("World").campaign = Campaign.new("user://menu_campaign_test.json")
	next_menu.selected_mission = 0
	next_menu._change_mission(0)
	next_menu._skip_intro()
	next_menu.get_node("Menu/Play").pressed.emit()
	assert(is_instance_valid(next_menu.transmission))
	next_menu.transmission.skip_animation()
	next_menu.transmission.accept_mission()
	await create_timer(0.4).timeout
	assert(not next_menu.starting)
	next_menu.preflight.show_selection()
	next_menu.preflight._select(1)
	assert(next_menu.preflight.confirm_button.disabled)
	next_menu.preflight._confirm()
	assert(not next_menu.starting, "A locked campaign cannot select another character")
	next_menu.preflight._select(2)
	next_menu.preflight._confirm()
	await process_frame
	assert(next_menu.starting)
	assert(not second.get_node("World").is_processing())
	var skip := InputEventKey.new()
	skip.keycode = KEY_ESCAPE
	skip.pressed = true
	next_menu._input(skip)
	await process_frame
	assert(second.get_node("World").is_processing())
	assert(second.get_node("World").mission_id == 0)
	next_menu = null
	DirAccess.remove_absolute("user://menu_campaign_test.json")
	DirAccess.remove_absolute("user://menu_transmission_test.cfg")
	print("Menu controls and start transition passed")
	quit()
