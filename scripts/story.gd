class_name Story
extends RefCounted
## Runs data/story.json: an ordered list of beats, each with a trigger (talk, use, enter),
## optional gates (who must do it, which item is needed) and dialogue that plays on completion.

const STORY_PATH := "res://data/story.json"

enum Check { NO_MATCH, OK, WRONG_ACTOR, MISSING_ITEM }

var data := {}
var beats: Array = []
var index := 0
var inventory: Array[String] = []
var payload := "satellite"

func _init(path := STORY_PATH) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("Story: cannot open %s" % path)
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Story: %s is not valid JSON" % path)
		return
	data = parsed
	beats = data.get("beats", [])

func reset() -> void:
	index = 0
	inventory.clear()

func finished() -> bool:
	return index >= beats.size()

func current() -> Dictionary:
	return {} if finished() else beats[index]

func objective() -> String:
	return "" if finished() else _fill(current().get("objective", ""))

func trigger() -> Dictionary:
	return current().get("trigger", {})

func positions() -> Dictionary:
	return current().get("positions", {})

func chatter_for(crew_id: String) -> Array:
	return data.get("chatter", {}).get(crew_id, [])

func item_name(item_id: String) -> String:
	return data.get("items", {}).get(item_id, {}).get("name", item_id.capitalize())

func item_icon(item_id: String) -> String:
	return "res://assets/ui/items/%s.png" % data.get("items", {}).get(item_id, {}).get("icon", item_id)

## Does doing `kind` with `target` as crewmate `actor_id` advance the current beat?
func check(kind: String, target: String, actor_id: String) -> int:
	var t := trigger()
	if finished() or t.get("type", "") != kind:
		return Check.NO_MATCH
	var key := "target" if kind == "talk" else ("room" if kind == "enter" else "spot")
	if t.get(key, "") != target:
		return Check.NO_MATCH
	var actor: String = current().get("actor", "")
	if actor != "" and actor != actor_id:
		return Check.WRONG_ACTOR
	var needs: String = current().get("needs_item", "")
	if needs != "" and not inventory.has(needs):
		return Check.MISSING_ITEM
	return Check.OK

func hold_time() -> float:
	return float(trigger().get("hold", 0.0))

## Applies the current beat's item changes, advances, and returns
## {"dialogue": [[speaker, text]...], "gained": item id or "", "ending": bool}.
func complete() -> Dictionary:
	var beat := current()
	var gained: String = beat.get("gives_item", "")
	if gained != "" and not inventory.has(gained):
		inventory.append(gained)
	var taken: String = beat.get("takes_item", "")
	if taken != "":
		inventory.erase(taken)
	var lines: Array = []
	for line in beat.get("dialogue", []):
		lines.append([line[0], _fill(line[1])])
	index += 1
	return {"dialogue": lines, "gained": gained, "ending": beat.get("ending", false)}

func _fill(text: String) -> String:
	return text.replace("{payload}", payload)

## "HH:MM" -> minutes after midnight, or -1.
static func parse_time(text: String) -> int:
	var parts := text.split(":")
	if parts.size() != 2:
		return -1
	return int(parts[0]) * 60 + int(parts[1])
