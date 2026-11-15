extends SceneTree
## Map, story data and full-chapter playthrough checks.
## Run: Godot --headless --path . -s tests/world_test.gd

var failures := 0

func check(condition: bool, label: String) -> void:
	if not condition:
		failures += 1
		printerr("FAIL: " + label)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var map := StationMap.new()
	var story := Story.new()
	test_map(map)
	for definition in Campaign.MISSIONS:
		test_story_data(map, Story.new(definition.story))
	test_stats()
	await test_switching_and_gates()
	await test_needs_and_fainting()
	await test_full_playthrough()
	if failures > 0:
		printerr("%d world checks failed" % failures)
		quit(1)
		return
	print("World map, story data, switching and playthrough checks passed")
	quit()

func test_map(map: StationMap) -> void:
	check(map.rooms.size() == 11, "eleven rooms loaded")
	check(map.room_at(Vector2(810, 705)) == "mess_hall", "mess hall located")
	check(map.room_at(Vector2(1710, 900)) == "outside", "launch complex is outdoors")
	check(map.is_blocked(Vector2(810, 780)), "meeting table is solid")
	check(map.is_wall(Vector2(561, 720)), "wall between med bay and mess hall")
	check(not map.is_wall(Vector2(561, 807)), "door between med bay and mess hall")
	check(not map.line_of_sight(Vector2(450, 720), Vector2(675, 720)), "walls block sight")
	for s in map.spawns:
		check(not map.is_blocked(s), "spawn %s walkable" % s)
	for id in map.spots:
		var pos: Vector2 = map.spots[id].pos
		check(not map.is_blocked(pos), "spot %s walkable" % id)
		check(map.find_path(map.spawns[0], pos).size() > 0, "spot %s reachable" % id)
	for i in map.doors.size():
		var c := map.doors[i].get_center()
		check(not map.is_blocked(c), "doorway %d is open" % i)
	check(map.door_side.count(true) == 6, "six doorways cut through vertical walls")
	for crew_id in map.posts:
		check(map.rooms.has(map.posts[crew_id]), "post room for %s exists" % crew_id)

func test_story_data(map: StationMap, story: Story) -> void:
	check(story.beats.size() > 0, "story has beats")
	check(story.beats[story.beats.size() - 1].get("ending", false), "last beat ends the chapter")
	for beat in story.beats:
		var t: Dictionary = beat.trigger
		var id: String = beat.id
		match t.type:
			"talk": check(CrewRoster.index_of(t.target) >= 0, "%s talks to a real crewmate" % id)
			"use": check(map.spots.has(t.spot), "%s uses a real spot" % id)
			"enter": check(map.rooms.has(t.room), "%s enters a real room" % id)
			"start": pass
			_: check(false, "%s has a known trigger type" % id)
		if beat.has("actor"):
			check(CrewRoster.index_of(beat.actor) >= 0, "%s actor is a crewmate" % id)
		for key in ["needs_item", "gives_item", "takes_item"]:
			if beat.has(key):
				check(story.data.items.has(beat[key]), "%s %s is defined" % [id, key])
		for crew_id in beat.get("positions", {}):
			var where: String = beat.positions[crew_id]
			check(map.spots.has(where) or map.rooms.has(where), "%s position %s exists" % [id, where])
		for line in beat.get("dialogue", []):
			check(line[0] == "you" or CrewRoster.index_of(line[0]) >= 0 or CrewRoster.SPEAKERS.has(line[0]), "%s speaker %s known" % [id, line[0]])
	check(Story.parse_time("19:30") == 19 * 60 + 30, "time parsing")

func test_stats() -> void:
	var s := CrewStats.new()
	s.tick(60.0, true, false)
	check(s.energy < CrewStats.MAX and s.food < CrewStats.MAX, "energy and food drain over time")
	s.energy = 0.0
	var before := s.health
	s.tick(10.0, false, false)
	check(s.health < before, "running on empty costs health")
	var gained := s.apply({"energy": 35})
	check(is_equal_approx(gained.energy, 35.0), "effects restore stats")
	s.energy = 10.0
	check(s.is_tired() and s.speed_factor() < 1.0, "tired crew walk slower")
	check(s.warning() == "energy", "lowest stat is flagged")

func _new_world() -> Node:
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	await process_frame
	world._begin_play()
	_flush(world)
	return world

func _flush(world) -> void:
	var guard := 0
	while world.phase == world.Phase.DIALOGUE and guard < 100:
		world.hud.finish_line()
		world._advance_dialogue()
		guard += 1

func test_switching_and_gates() -> void:
	var world = await _new_world()
	check(world.phase == world.Phase.PLAYING, "intro dialogue flows into play")
	check(world.player.id == "nova", "chapter starts as Aisyah (Planner)")
	world.switch_to(1)
	check(world.player.id == "orion", "1-4 switches crew")
	check(not world.characters[0].is_player, "previous crewmate goes back to AI")
	var tab := InputEventKey.new()
	tab.keycode = KEY_TAB
	tab.pressed = true
	world._unhandled_input(tab)
	check(world.player.id == "juno", "Tab cycles to the next crewmate")
	# Planner decisions stay actor-gated in standalone play.
	while world.story.current().get("decision", "") != "P1":
		world.story.index += 1
	world.player.position = world.map.spots["plot_trajectory"].pos
	world.interact()
	check(world.hold.is_empty(), "wrong role cannot do a planner's job alone")
	world.switch_to(0)
	world.player.position = world.map.spots["plot_trajectory"].pos
	world.interact()
	check(not world.hold.is_empty(), "Aisyah starts the planning activity")
	world._update_hold(10, Vector2.ZERO, true)
	check(world.phase == world.Phase.ACTIVITY, "work opens a real decision activity")

	world.queue_free()
	await process_frame

func test_needs_and_fainting() -> void:
	var world = await _new_world()
	var s: CrewStats = world.stats[world.player_index]
	s.energy = 20.0
	world.player.position = world.map.spots["coffee_machine"].pos
	var near: Dictionary = world.interaction_near()
	check(near.get("target", "") == "coffee_machine", "coffee machine is offered")
	world.interact()
	for i in 30:
		world._update_hold(0.1, Vector2.ZERO, true)
	check(s.energy > 50.0, "coffee restores energy")
	# Coffee gives the most energy but little food; vending machines give a balance of both.
	s.energy = 20.0
	s.food = 20.0
	var coffee: Dictionary = world.map.spots["coffee_machine"].effects
	for n in 3:
		var vend: Dictionary = world.map.spots["vending_machine_%d" % (n + 1)].effects
		assert(coffee.energy > vend.energy and coffee.food < vend.food and vend.food > 0)
	world.player.position = world.map.spots["vending_machine_3"].pos
	check(world.interaction_near().get("target", "") == "vending_machine_3", "vending machine is offered")
	world.interact()
	for i in 30:
		world._update_hold(0.1, Vector2.ZERO, true)
	check(s.energy >= 49.0 and s.food >= 44.0, "vending machine restores both energy and food")
	# A nap in the Crew Quarters restores health as well as energy.
	s.health = 20.0
	s.energy = 20.0
	world.player.position = world.map.spots["bunk"].pos
	world.interact()
	for i in 80:
		world._update_hold(0.1, Vector2.ZERO, true)
	check(s.health >= 55.0 and s.energy >= 85.0, "napping in the bunk restores health and energy")
	world.player.position = world.map.spots["food_counter"].pos
	s.food = 10.0
	world.interact()
	for i in 30:
		world._update_hold(0.1, Vector2.ZERO, true)
	check(s.food > 60.0, "the food counter feeds you")
	s.health = 0.0
	var clock_before: float = world.minutes
	world._faint()
	check(s.health > 0.0, "fainting restores some health")
	check(world.minutes > clock_before, "fainting costs time")
	check(world.map.room_at(world.player.position) == "medbay", "you wake up in Med Bay")
	world.queue_free()
	await process_frame

func test_full_playthrough() -> void:
	var world = await _new_world()
	var guard := 0
	while world.phase != world.Phase.ENDING and guard < 80:
		guard += 1
		var beat: Dictionary = world.story.current()
		var t: Dictionary = beat.trigger
		if beat.has("actor"):
			world.switch_to(CrewRoster.index_of(beat.actor))
		if t.type == "talk" and world.player.id == t.target:
			world.switch_to((CrewRoster.index_of(t.target) + 1) % 4)
		match t.type:
			"talk":
				world.player.position = world.characters[CrewRoster.index_of(t.target)].position + Vector2(12, 0)
				world.interact()
			"use":
				world.player.position = world.map.spots[t.spot].pos
				world.interact()
				world._update_hold(10, Vector2.ZERO, true)
			"enter":
				world.player.position = world.map.rooms[t.room].floor_rect.get_center()
				world._check_enter_trigger()
		if world.phase == world.Phase.ACTIVITY:
			world.activity.choose_option(0)
			if is_instance_valid(world.activity) and world.activity.kind == "puzzle":
				world.activity.finish_puzzle(100)
				world.activity.accept_result()
		_flush(world)
	check(world.phase == world.Phase.ENDING, "design reaches its ending")
	check(world.story.finished(), "all design scenes completed")
	check(world.forest.state.choices.size() == 15, "every department made its design decisions")
	check(world.scenery.rocket.position == world.map.rocket_pos, "Design does not launch the rocket")
	print("Forest design playthrough: %d beats in %d steps" % [world.story.index, guard])
	world.queue_free()
	await process_frame
