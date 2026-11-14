extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	assert(FileAccess.file_exists("res://assets/interiors/props.json"), "Interior furniture atlas has placements")
	var placements = JSON.parse_string(FileAccess.get_file_as_string("res://assets/interiors/props.json"))
	var atlas: Texture2D = load("res://assets/interiors/props.png")
	var layout = JSON.parse_string(FileAccess.get_file_as_string("res://data/station_layout.json"))
	var map := StationMap.new()
	var ids: Array = []
	for item in placements:
		if item.has("source_index"):
			assert(not ids.has(item.source_index), "No furniture duplicates")
			ids.append(item.source_index)
		var region := Rect2(item.region[0], item.region[1], item.region[2], item.region[3])
		assert(Rect2(Vector2.ZERO, atlas.get_size()).encloses(region), "Furniture stays inside the atlas")
		if item.has("source_index"):
			assert(item.position[1] >= layout.obstacles[item.source_index].rect[1], "Sort position is at the furniture's feet")
		elif item.has("parent_index"):
			assert(item.has("collision"), "Freestanding chairs have matching solid bases")
			var base: Array = item.collision
			assert(map.is_blocked(Vector2(base[0] + base[2] / 2, base[1] + base[3] / 2)), "Chairs cannot be walked through")
	for i in layout.obstacles.size():
		if layout.obstacles[i].kind not in ["car", "launch_pad"]:
			assert(ids.has(float(i)), "Every interior obstacle has raised artwork")
	for spot in layout.spots:
		if spot.room == "outside" or spot.id in ["bunk", "assemble_panels", "health_scan"]:
			continue
		var found := false
		for item in placements:
			if item.get("source_spot", "") == spot.id:
				found = true
		assert(found, "Indoor mission fixtures use matching raised artwork: " + spot.id)
	for spot in map.spots.values():
		assert(not map.is_blocked(spot.pos), "Mission station stays clear: " + spot.id)
		assert(not map.find_path(map.spawns[0], spot.pos).is_empty(), "Mission station stays reachable: " + spot.id)
	var world = load("res://scenes/main.tscn").instantiate()
	root.add_child(world)
	assert(world.y_sort_enabled)
	var furniture: Node = world.get_node("Interior0")
	assert(furniture is Sprite2D and furniture.texture is AtlasTexture, "Furniture participates in world Y sorting")
	assert(furniture.z_index == world.characters[0].z_index, "Crew can pass behind furniture")
	world.gather_at_mess_table()
	for i in world.characters.size():
		assert(world.get_node("MeetingChair0_%d" % i).position.y <= world.characters[i].position.y, "Meeting chairs sort behind the seated crew")
	world.queue_free()
	await process_frame
	print("Interior atlas coverage, occlusion layers and all mission routes passed")
	quit()
