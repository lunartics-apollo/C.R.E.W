extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var activity_script = load("res://scripts/mission_activity.gd")
	assert(activity_script != null, "Reusable mission activity exists")
	var mission = load("res://scripts/forest_mission.gd").new()
	var activity = activity_script.new()
	activity.setup(mission, "P1")
	root.add_child(activity)
	await process_frame
	assert(activity.get_node("Choices").get_child_count() > 0)
	assert(activity.get_node("Choices/LeadFace").texture != null, "The lead's face is shown with their line")
	activity.choose_option(0)
	assert(activity.puzzle_type == "rocket_fit")
	activity.slider.value = mission.state.mass_need_kg
	activity.submit_puzzle()
	assert(activity.puzzle_score >= 50, "A safe payload fits the chosen rocket")
	activity.queue_free()
	await process_frame
	activity = activity_script.new()
	activity.setup_checklist(mission)
	root.add_child(activity)
	activity.check_item(1)
	assert(activity.checked == 0, "Checklist cannot be completed out of order")
	for i in 8:
		activity.check_item(i)
	assert(activity.checked == 8)
	assert(not activity.continue_button.disabled)
	activity.queue_free()
	await process_frame
	# Exercise the actual Core puzzle controls, not just their scoring API.
	for id in mission.DESIGN_IDS:
		mission.choose(id, 0)
	for id in ["E3", "C3", "S2"]:
		activity = activity_script.new()
		activity.setup(mission, id)
		root.add_child(activity)
		activity.choose_option(0)
		match id:
			"E3":
				activity.toggles.assign([false, false, true, true])
			"C3":
				activity.toggles.assign([true, true, true, false])
			"S2":
				activity.toggles.assign([true, false, false, true])
		activity.submit_puzzle()
		assert(activity.puzzle_score >= 80, "A valid Core solution earns Gold: " + id)
		activity.queue_free()
		await process_frame
	for id in mission.DESIGN_IDS:
		mission.choose(id, 0)
	assert(mission.launch(0).success)
	for id in mission.EVENT_IDS:
		activity = activity_script.new()
		activity.setup(mission, id)
		root.add_child(activity)
		activity.choose_option(0)
		match id:
			"EV8":
				activity.event_action(1)
			"EV6":
				for i in 3:
					activity.event_action(i)
			"C4":
				for i in 122:
					if activity.kind != "puzzle":
						break
					activity.slider.value = 50 + sin((activity.elapsed + 0.1) * 1.1) * 23
					activity._process(0.1)
			"EV3", "EV4":
				activity.toggles.assign([false, false, true, true])
				activity.submit_puzzle()
			"EV9":
				activity.elapsed = 3.1
				for i in [0, 2, 1, 3]:
					activity.event_action(i)
			"EV5":
				activity.debris.append({"x": 240.0, "y": 197.0, "hit": false})
				activity._process(0.01)
				assert(activity.hits == 1, "Debris collision is detected")
				activity.elapsed = 19.99
				activity._process(0.02)
		assert(activity.puzzle_score >= 80, "Operation controls produce a valid result: " + id)
		activity.queue_free()
		await process_frame
	var engineer = load("res://scripts/forest_mission.gd").new({"mode": "engineer"})
	activity = activity_script.new()
	activity.setup(engineer, "P1")
	root.add_child(activity)
	activity.choose_option(0)
	activity.finish_puzzle(30)
	activity.show_puzzle()
	activity.finish_puzzle(90)
	assert(engineer.state.attempts.P1 == 2)
	assert(not activity.body.has_node("Retry"), "Engineer mode permits exactly one retry")
	activity.queue_free()
	await process_frame
	print("Mission choices, interactive mass fit and ordered launch checklist passed")
	quit()
