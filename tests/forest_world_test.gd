extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func flush(world: Node) -> void:
	var guard := 0
	while world.phase == world.Phase.DIALOGUE:
		guard += 1
		assert(guard < 80)
		world.hud.finish_line()
		world._advance_dialogue()

func finish_activity(world: Node) -> void:
	var activity = world.activity
	if activity.kind == "checklist":
		for i in 8:
			activity.check_item(i)
		activity.continue_button.pressed.emit()
	else:
		activity.choose_option(0)
		if is_instance_valid(world.activity) and world.activity.kind == "puzzle":
			world.activity.finish_puzzle(100)
			world.activity.accept_result()

func make_world(campaign: Campaign, stage: int) -> Node:
	var world = load("res://scenes/main.tscn").instantiate()
	world.campaign = campaign
	world.set_mission(stage)
	root.add_child(world)
	world.set_process(false)
	world.set_process_unhandled_input(false)
	return world

func run() -> void:
	Engine.time_scale = 20
	for selected in 4:
		var campaign := Campaign.new("user://forest_world_test.json")
		campaign.character = -1
		campaign.completed.clear()
		assert(campaign.select_character(selected))
		campaign.forest.state.mode = "sandbox"
		for stage in 3:
			var world = make_world(campaign, stage)
			assert(world.map.room_at(world.player.position) == "mess_hall")
			world._begin_play()
			flush(world)
			world.switch_to((selected + 1) % 4)
			assert(world.player_index == selected, "Role stays locked across the story")
			var guard := 0
			while not world.story.finished():
				guard += 1
				assert(guard < 100, "Forest story cannot deadlock")
				var beat: Dictionary = world.story.current()
				match beat.trigger.type:
					"use":
						world.player.position = world.map.spots[beat.trigger.spot].pos
						world.interact()
						assert(not world.hold.is_empty())
						var expected: float = world.story.hold_time() * (0.75 if beat.get("actor", "") == world.player.id else 1)
						assert(is_equal_approx(world.hold.time, expected), "Department ability matches the chosen role")
						world._update_hold(10, Vector2.ZERO, true)
					"talk":
						world.player.position = world.characters[CrewRoster.index_of(beat.trigger.target)].position
						world.interact()
					"enter":
						world.player.position = world.map.rooms[beat.trigger.room].floor_rect.get_center()
						world._check_enter_trigger()
				if world.phase == world.Phase.ACTIVITY:
					finish_activity(world)
				flush(world)
				assert(world.player_index == selected)
			await create_timer(5.3).timeout
			assert(world.mission_recorded, "A successful stage is saved")
			assert(campaign.completed.size() == stage + 1)
			assert(campaign.locked() == (stage < 2))
			if stage == 2:
				assert(world.activity.kind == "report")
				assert(world.forest.report().ending == "E1")
				var final_state := JSON.stringify(campaign.forest.state)
				world.activity.decline()
				assert(world.activity.has_signal("address_requested"), "The ending address leads to the actual score report")
				world.activity.address_requested.emit()
				assert(world.activity.kind == "report")
				assert(JSON.stringify(campaign.forest.state) == final_state and campaign.completed.size() == 3, "Replaying an ending never rerolls or duplicates credit")
			world.queue_free()
			await process_frame
			campaign = Campaign.new("user://forest_world_test.json")
			assert(campaign.character == selected)
			assert(campaign.completed.size() == stage + 1, "Reload preserves stage and design")
		assert(campaign.forest.state.quarters.size() == 7)
		assert(not campaign.locked())
	# Blocked review and a cached launch failure must never award a stage.
	var failed := Campaign.new("user://forest_world_test.json")
	failed.forest.reset()
	failed.completed.assign([0])
	failed.beats.clear()
	failed.forest.choose("S1", 1)
	var world = make_world(failed, 1)
	for i in world.story.beats.size():
		if world.story.beats[i].get("checkpoint", "") == "review":
			world.story.index = i
	world._complete_beat()
	assert(world.activity.report_data.ending == "E8" and not world.mission_recorded)
	assert(failed.completed.size() == 1)
	world.queue_free()
	await process_frame
	failed.forest.reset()
	failed.forest.launch(1)
	world = make_world(failed, 1)
	world.story.index = world.story.beats.size() - 1
	world.checklist_done = true
	world._complete_beat()
	assert(world.activity.report_data.ending == "E7" and not world.mission_recorded)
	assert(failed.completed.size() == 1)
	world.queue_free()
	await process_frame
	DirAccess.remove_absolute("user://forest_world_test.json")
	Engine.time_scale = 1
	print("All four roles completed Design, Review/Launch and 7-quarter Operations; saves and failure gates passed")
	quit()
