class_name Campaign
extends RefCounted

const MISSIONS := [
	{"name": "DESIGN", "payload": "forest-watch CubeSat", "story": "res://data/story.json"},
	{"name": "REVIEW & LAUNCH", "payload": "forest-watch CubeSat", "story": "res://data/lunar_story.json"},
	{"name": "OPERATE & REPORT", "payload": "forest-watch CubeSat", "story": "res://data/relay_story.json"},
]
var character := -1
var completed: Array[int] = []
var save_path: String
var forest := ForestMission.new()
var beats: Dictionary = {}

func _init(path := "user://crew_campaign.json") -> void:
	save_path = path
	if not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return
	var data = JSON.parse_string(file.get_as_text())
	if not data is Dictionary:
		return
	if data.get("mode", "") in ["cadet", "engineer"]:
		forest = ForestMission.new({"mode": data.mode})
	var saved = data.get("character", -1)
	if not (saved is float or saved is int) or saved != int(saved) or saved < 0 or saved >= CrewRoster.CREW.size():
		return
	character = int(saved)
	# Older saves use earlier decision numbers, so they must not unlock stages.
	if data.get("story_version", 0) != 3:
		return
	if data.get("forest") is Dictionary:
		forest = ForestMission.new(data.forest)
	if data.get("beats") is Dictionary:
		for key in data.beats:
			var value = data.beats[key]
			if key in ["0", "1", "2"] and (value is int or value is float) and value >= 0 and value < 100:
				beats[key] = int(value)
	var missions = data.get("completed", [])
	if missions is Array:
		for id in missions:
			if (id is float or id is int) and id == int(id) and id >= 0 and id < MISSIONS.size() and not completed.has(int(id)):
				completed.append(int(id))

func locked() -> bool:
	return character >= 0 and completed.size() < MISSIONS.size()

func select_character(index: int) -> bool:
	if locked() or index < 0 or index >= CrewRoster.CREW.size():
		return false
	var previous := character
	var previous_completed := completed.duplicate()
	var previous_forest := forest
	var previous_beats := beats.duplicate()
	character = index
	completed.clear()
	forest = ForestMission.new({"mode": previous_forest.state.mode})
	beats.clear()
	if save():
		return true
	character = previous
	completed.assign(previous_completed)
	forest = previous_forest
	beats = previous_beats
	return false

func restart_project() -> bool:
	var previous_character := character
	var was_unlocked := not locked()
	var previous_forest := forest
	var previous_completed := completed.duplicate()
	var previous_beats := beats.duplicate()
	forest = ForestMission.new({"mode": previous_forest.state.mode})
	if was_unlocked:
		character = -1
	completed.clear()
	beats.clear()
	if save():
		return true
	forest = previous_forest
	character = previous_character
	completed.assign(previous_completed)
	beats = previous_beats
	return false

func finish_mission(id: int) -> bool:
	if character < 0 or id < 0 or id >= MISSIONS.size() or completed.has(id) or (id > 0 and not completed.has(id - 1)):
		return false
	completed.append(id)
	if save():
		return true
	completed.erase(id)
	return false

func next_mission() -> int:
	for id in MISSIONS.size():
		if not completed.has(id):
			return id
	return 0

func save() -> bool:
	# Write a sibling file first so an interrupted save preserves the previous progress.
	var file := FileAccess.open(save_path + ".tmp", FileAccess.WRITE)
	if file == null:
		return false
	file.store_string(JSON.stringify({"story_version": 3, "character": character, "mode": forest.state.mode, "completed": completed, "forest": forest.state, "beats": beats}))
	var error := file.get_error()
	file.close()
	if error != OK:
		return false
	return DirAccess.rename_absolute(save_path + ".tmp", save_path) == OK
