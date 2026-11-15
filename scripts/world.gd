extends Node2D
## C.R.E.W. ground station: a story-driven top-down pixel game on Earth.
## You control one of four crewmates at a time (Tab / 1-4). The story in data/story.json
## moves on as you talk to the crew, use things and carry items; some jobs need a specific
## crewmate. Look after health, energy and food at the coffee machine, food counter, water
## cooler, medical cabinet and your bunk. The clock runs and the lights come on at night.

enum Phase { INTRO, PLAYING, DIALOGUE, PAUSED, ENDING, ACTIVITY }

const USE_RANGE := 22.0
const TALK_RANGE := 28.0
const MINUTES_PER_SECOND := 2.0
const INTRO_TIME := 2.4
const ENDING_CARD_DELAY := 5.0
const CAMERA_SMOOTHING := 7.0
const EFFECT_HOLD := 1.2
const NAG_EVERY := 18.0
const NIGHT_TINT := [  # hour -> CanvasModulate colour, blended between neighbours
	[0, Color("#4d5a8c")], [5, Color("#5c6796")], [7, Color("#e9dccb")], [9, Color.WHITE],
	[16, Color.WHITE], [18, Color("#f2c9a0")], [20, Color("#7d79a6")], [22, Color("#4d5a8c")], [24, Color("#4d5a8c")]]
const STAT_LABELS := {"health": "HEALTH", "energy": "ENERGY", "food": "FOOD"}
const STAT_COLORS := {"health": Color("#ff8a80"), "energy": Color("#f2c94c"), "food": Color("#f0a060")}
const NAGS := {"health": "I don't feel so good...", "energy": "So tired... I need coffee.", "food": "I'm starving. Food counter?"}

var map: StationMap
var story: Story
var phase := Phase.INTRO
var paused_from := Phase.PLAYING
var mission_id := 0
var campaign: Campaign
var mission_recorded := false
var at_meeting := false
var forest := ForestMission.new()
var activity: Control
var decision_done := false
var checklist_done := false
var stage_success := true
var day := 1
var minutes := 0.0
var intro_timer := 0.0
var nag_timer := NAG_EVERY
var rng := RandomNumberGenerator.new()
var characters: Array[CrewMember] = []
var ais: Array[CrewAI] = []
var stats: Array[CrewStats] = []
var player: CrewMember
var player_index := 0
var view_index := -1      # >= 0 while looking at another crewmate (view only)
var dialogue_queue: Array = []
var ending_pending := false
var hold := {}              # {"spot", "time", "effect": bool} while holding E on a spot
var hold_progress := 0.0
var last_room := ""

var hud: CanvasLayer
var camera: Camera2D
var tint: CanvasModulate
var scenery: StationScenery
var doors: StationDoors
var lights: NightLights
var cues: InteractionCues

func set_mission(value: int) -> void:
	mission_id = clampi(value, 0, Campaign.MISSIONS.size() - 1)
	if story:
		story = Story.new(Campaign.MISSIONS[mission_id].story)
		story.payload = Campaign.MISSIONS[mission_id].payload

func _ready() -> void:
	rng.randomize()
	map = StationMap.new()
	story = Story.new(Campaign.MISSIONS[mission_id].story)
	story.payload = Campaign.MISSIONS[mission_id].payload
	var ground := Sprite2D.new()
	ground.texture = load("res://assets/space_center.png")
	ground.centered = false
	ground.z_index = -10
	add_child(ground)
	y_sort_enabled = true
	scenery = StationScenery.new()
	add_child(scenery)
	scenery.build(self, map)
	doors = StationDoors.new()
	doors.y_sort_enabled = true
	add_child(doors)
	doors.build(map)
	for i in CrewRoster.CREW.size():
		var member := CrewMember.new()
		member.setup(i, map)
		member.position = map.spawns[i]
		add_child(member)
		member.stepped.connect(_on_step.bind(member))
		characters.append(member)
		ais.append(CrewAI.new(member, self, rng.randi()))
		stats.append(CrewStats.new())
	lights = NightLights.new()
	add_child(lights)
	lights.build(map)
	cues = InteractionCues.new()
	add_child(cues)
	camera = Camera2D.new()
	camera.limit_left = 0
	camera.limit_top = 0
	camera.limit_right = map.size.x
	camera.limit_bottom = map.size.y
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = CAMERA_SMOOTHING
	add_child(camera)
	tint = CanvasModulate.new()
	add_child(tint)
	hud = preload("res://scripts/hud.gd").new()
	hud.name = "HUD"
	add_child(hud)
	hud.setup_minimap(map)
	hud.help_requested.connect(_on_help_button)
	hud.exit_requested.connect(_exit_to_menu)
	start_chapter()

# ── chapter flow ─────────────────────────────────────────────────────────────
func start_chapter() -> void:
	mission_recorded = false
	at_meeting = false
	story.reset()
	forest = campaign.forest if campaign != null else ForestMission.new()
	# If the rocket was lost, Operations has nothing to fly: go straight to the mission-lost scene and report.
	var lost: bool = mission_id == 2 and forest.state.launch_resolved and not forest.state.launch_success
	var all_beats: Array = story.data.get("beats", [])
	if lost:
		story.beats = all_beats.filter(func(b): return b.get("only_if", "") == "launch_failed" or b.get("id", "") == "mission_report")
	else:
		story.beats = all_beats.filter(func(b): return b.get("only_if", "") != "launch_failed")
	if campaign != null and not campaign.completed.has(mission_id):
		story.index = clampi(int(campaign.beats.get(str(mission_id), 0)), 0, story.beats.size() - 1)
	decision_done = false
	checklist_done = false
	stage_success = true
	day = int(story.data.get("start_day", 1))
	minutes = float(Story.parse_time(story.data.get("start_time", "08:00")))
	dialogue_queue.clear()
	ending_pending = false
	hold = {}
	for i in characters.size():
		characters[i].position = map.spawns[i]
		characters[i].stop()
		characters[i].show()
		stats[i] = CrewStats.new()
	scenery.reset_rocket()
	scenery.set_workbench_done(false)
	_control(campaign.character if campaign != null and campaign.character >= 0 else max(0, CrewRoster.index_of(story.data.get("start_crew", "nova"))))
	if campaign != null:
		gather_at_mess_table()
	camera.position = player.position
	camera.reset_smoothing()
	last_room = map.room_at(player.position)
	hud.hide_dialogue()
	hud.toggle_help(false)
	if campaign != null:
		hud.set_campaign_help()
	hud.set_round_ui(false)
	hud.show_card(story.data.get("chapter", ""), story.data.get("title", ""), "H: controls and help")
	_apply_positions()
	intro_timer = INTRO_TIME
	phase = Phase.INTRO

func gather_at_mess_table() -> void:
	at_meeting = true
	var table := map.meeting_table
	var center := table.get_center()
	var places := [
		Vector2(center.x, table.position.y - 8),
		Vector2(table.end.x + 22, center.y + 8),
		Vector2(center.x, table.end.y + 24),
		Vector2(table.position.x - 22, center.y + 8),
	]
	for i in characters.size():
		characters[i].position = places[i]
		characters[i].stop()
		characters[i].face(center - places[i])
		ais[i].goal = "~"
	camera.zoom = Vector2.ONE
	camera.position = center + Vector2(0, 20)
	camera.reset_smoothing()
	camera.force_update_scroll()
	tint.color = Color.WHITE

func _begin_play() -> void:
	hud.fade_card(0.6)
	hud.set_round_ui(true)
	phase = Phase.PLAYING
	if mission_id == 0 and story.index == 0:
		hud.play_hornbill()
	if story.trigger().get("type", "") == "start":
		_complete_beat()

## Finishes the current beat: items, dialogue, then sets up the next beat.
func _complete_beat() -> void:
	var beat := story.current()
	if beat.has("decision") and not decision_done:
		_open_activity(beat.decision)
		return
	var checkpoint: String = beat.get("checkpoint", "")
	if checkpoint == "launch":
		if not checklist_done:
			_open_activity("checklist")
			return
		forest.launch()
		_save_story_progress()
	if checkpoint == "report":
		stage_success = true   # reaching the report always counts; the report explains any mistakes
	var result := story.complete()
	# The review is a warning, never a wall: red checks are named, then the team can still launch.
	if checkpoint == "review":
		var review := forest.review()
		if review.approved:
			result.dialogue.append(["nova", "Stamp: APPROVED FOR LAUNCH."])
		else:
			result.dialogue.append(["nova", "Some checks are red: " + str(review.problems[0]) + "."])
			result.dialogue.append(["nova", "We can still launch. But expect trouble, and we will learn from it."])
	if checkpoint == "launch" and not forest.state.launch_success:
		result.dialogue.append(["kai", "We have lost the vehicle."])
		result.dialogue.append(["nova", "Launch is hard. Let's see what we can learn."])
	decision_done = false
	checklist_done = false
	_save_story_progress()
	if result.gained != "":
		hud.show_toast(load(story.item_icon(result.gained)), "Got: " + story.item_name(result.gained))
		scenery.play("lab_build")
	if story.current().has("set_time"):
		minutes = float(Story.parse_time(story.current().set_time))
	if story.current().get("next_day", false):
		day += 1
		for s in stats:
			s.energy = CrewStats.MAX   # a night's sleep
	_apply_positions()
	ending_pending = result.ending
	scenery.set_workbench_done(_beat_done("panels"))
	dialogue_queue = result.dialogue.duplicate()
	if dialogue_queue.is_empty():
		_after_dialogue()
	else:
		_next_line()

func _save_story_progress() -> bool:
	if campaign == null:
		return true
	campaign.beats[str(mission_id)] = story.index
	var saved := campaign.save()
	if not saved:
		hud.show_toast(null, "Progress could not be saved. Check free space.")
	return saved

func _open_activity(id: String) -> void:
	phase = Phase.ACTIVITY
	player.stop()
	activity = preload("res://scripts/mission_activity.gd").new()
	if id == "checklist":
		activity.setup_checklist(forest)
	else:
		activity.setup(forest, id)
	activity.finished.connect(_activity_finished)
	hud.root.add_child(activity)

func _activity_finished(result: Dictionary) -> void:
	if not result.get("ok", false):
		return
	activity.queue_free()
	hud.root.remove_child(activity)
	activity = null
	if result.id == "checklist":
		checklist_done = true
	else:
		decision_done = true
	_save_story_progress()
	_complete_beat()

func _beat_done(beat_id: String) -> bool:
	for i in story.index:
		if story.beats[i].get("id", "") == beat_id:
			return true
	return false

func _apply_positions() -> void:
	var wanted := story.positions()
	for i in characters.size():
		if characters[i] != player:
			ais[i].set_goal(wanted.get(characters[i].id, ""))
	if campaign != null:
		var actor := CrewRoster.index_of(story.current().get("actor", ""))
		if actor >= 0 and actor != player_index and story.trigger().get("type", "") == "use":
			ais[actor].set_goal(story.trigger().spot)

func _after_dialogue() -> void:
	hud.hide_dialogue()
	if ending_pending:
		_start_ending()
		return
	phase = Phase.PLAYING
	at_meeting = false

func _next_line() -> void:
	phase = Phase.DIALOGUE
	player.stop()
	hold = {}
	player.busy = false
	var line: Array = dialogue_queue.pop_front()
	var speaker_id: String = player.id if line[0] == "you" else line[0]
	var idx := CrewRoster.index_of(speaker_id)
	var speaker_name: String = CrewRoster.speaker_name(speaker_id)
	var portrait: Texture2D = load(CrewRoster.portrait_path(speaker_id)) if idx >= 0 else _cast_portrait(speaker_id)
	hud.show_line(speaker_name, portrait, line[1])
	if idx >= 0:
		characters[idx].say("...", 1.2)
	scenery.play("station_near")

## Speakers who are not crew (Minister Hamdan) use the face from their broadcast cast art.
func _cast_portrait(speaker_id: String) -> Texture2D:
	var path := "res://assets/briefing/cast_%s.png" % speaker_id
	if not ResourceLoader.exists(path):
		return null
	var face := AtlasTexture.new()
	face.atlas = load(path)
	face.region = Rect2(6, 2, 84, 84)   # head and shoulders from the first (neutral) frame
	return face

func _advance_dialogue() -> void:
	if not hud.line_finished():
		hud.finish_line()
	elif dialogue_queue.is_empty():
		_after_dialogue()
	else:
		_next_line()

func _start_ending() -> void:
	phase = Phase.ENDING
	hud.set_round_ui(false)
	cues.point_at(Vector2.INF, false)
	cues.clear_focus()
	if mission_id == 1 and forest.state.launch_success:
		scenery.launch_rocket()
		hud.play_hornbill()
	if is_inside_tree():
		await get_tree().create_timer(ENDING_CARD_DELAY).timeout
	if phase != Phase.ENDING:
		return
	scenery.play("mission_complete")
	if campaign != null and stage_success:
		mission_recorded = campaign.finish_mission(mission_id) or campaign.completed.has(mission_id)
	if mission_id == 2:
		_show_report()
		return
	var message := "DESIGN COMPLETE" if mission_id == 0 else ("SIGNAL ACQUIRED!" if forest.state.launch_success else "LAUNCH LOST")
	if not mission_recorded and campaign != null:
		message = "SAVE FAILED - ENTER TO RETRY"
	hud.show_card("BORNEO FOREST WATCH", message, "ENTER: mission select / Next: " + ("Review & Launch" if mission_id == 0 else "Operations & Report"))

func _show_report() -> void:
	phase = Phase.ENDING
	hud.set_round_ui(false)
	hud.hide_dialogue()
	hud.card.hide()
	activity = preload("res://scripts/transmission.gd").new()
	activity.setup_report(campaign, forest.report())
	activity.accepted.connect(_show_report_details)
	activity.declined.connect(_show_report_details)
	hud.root.add_child(activity)
	hud.play_hornbill()

func _show_report_details(_stage := -1) -> void:
	if is_instance_valid(activity):
		hud.root.remove_child(activity)
		activity.queue_free()
	activity = preload("res://scripts/mission_activity.gd").new()
	activity.setup_report(forest, forest.report())
	activity.address_requested.connect(_replay_report_address)
	activity.finished.connect(func(_result): get_tree().change_scene_to_file("res://scenes/menu.tscn"))
	hud.root.add_child(activity)

func _replay_report_address() -> void:
	hud.root.remove_child(activity)
	activity.queue_free()
	_show_report()

## Collapsing from no health: wake up in Med Bay two hours later.
func _faint() -> void:
	var s := stats[player_index]
	s.health = 40.0
	s.energy = maxf(s.energy, 50.0)
	s.food = maxf(s.food, 40.0)
	minutes += 120.0
	player.stop()
	player.position = map.spots["restock_medkits"].pos + Vector2(0, 14)
	camera.reset_smoothing()
	dialogue_queue = [["aisyah", "Easy. Rest, eat and drink some water. We look after each other."]]
	_next_line()

# ── switching crew ───────────────────────────────────────────────────────────
func _control(i: int) -> void:
	if player:
		player.is_player = false
		player.busy = false
		player.speed_scale = 1.0
	view_index = -1
	player_index = i
	player = characters[i]
	player.is_player = true
	player.stop()
	hold = {}
	var wanted := story.positions()
	for j in characters.size():
		if characters[j] != player:
			ais[j].goal = "~"   # force a fresh goal even if it hasn't changed
			ais[j].set_goal(wanted.get(characters[j].id, ""))

func switch_to(i: int) -> void:
	if campaign != null and campaign.locked():
		# The role stays locked, but the camera may look at the others (view only).
		if phase == Phase.PLAYING and i >= 0 and i < characters.size():
			_view_crewmate(-1 if i == player_index else i)
		return
	if phase != Phase.PLAYING or i == player_index or i < 0 or i >= characters.size():
		return
	_control(i)
	last_room = map.room_at(player.position)
	cues.float_text(player.position, player.info.name, player.info.color.lightened(0.3))
	scenery.play("station_near")

# ── per-frame ────────────────────────────────────────────────────────────────
func _process(delta: float) -> void:
	match phase:
		Phase.INTRO:
			intro_timer -= delta
			if intro_timer <= 0.0:
				_begin_play()
		Phase.PLAYING:
			_tick_world(delta)
			_update_player(delta)
			_check_enter_trigger()
			_check_room()
		Phase.PAUSED:
			return
	if phase not in [Phase.ENDING, Phase.ACTIVITY] and not at_meeting:
		for i in characters.size():
			if characters[i] != player:
				ais[i].update(delta)
	doors.update_doors(delta, characters)
	if phase != Phase.PLAYING and view_index >= 0:
		_view_crewmate(-1)
	var camera_target: Vector2 = characters[view_index].position if view_index >= 0 else player.position
	camera.position = (map.rocket_pos if phase == Phase.ENDING and mission_id == 1 and stage_success else camera_target).round()
	tint.color = _tint_for(minutes)
	lights.set_darkness(clampf((1.0 - tint.color.v) * 2.4, 0.0, 1.0))
	_update_hud()

func _tick_world(delta: float) -> void:
	var game_minutes := delta * MINUTES_PER_SECOND
	minutes += game_minutes
	if minutes >= 24 * 60:
		minutes -= 24 * 60
		day += 1
	var s := stats[player_index]
	s.tick(game_minutes, player.moving, not hold.is_empty())
	player.speed_scale = s.speed_factor()
	nag_timer -= delta
	if nag_timer <= 0.0:
		nag_timer = NAG_EVERY
		var warn := s.warning()
		if warn != "":
			player.say(NAGS[warn], 3.0)
	if s.fainted():
		_faint()

func _update_player(delta: float) -> void:
	var dir := Vector2(
		float(Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) - float(Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT)),
		float(Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) - float(Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP)))
	if not hold.is_empty():
		_update_hold(delta, dir, _use_key_held())
		return
	if dir != Vector2.ZERO and view_index >= 0:
		_view_crewmate(-1)   # moving brings the camera back to your own crewmate
	player.walk(dir, delta)

## View-only look at another crewmate in another room. -1 returns to your own view.
func _view_crewmate(i: int) -> void:
	view_index = i
	if i < 0:
		hud.show_view_banner("")
		return
	var who: Dictionary = characters[i].info
	hud.show_view_banner("VIEWING %s (VIEW ONLY)" % who.name)
	scenery.play("station_near")

func _use_key_held() -> bool:
	return Input.is_key_pressed(KEY_E) or Input.is_key_pressed(KEY_SPACE) or Input.is_key_pressed(KEY_ENTER)

## Advances a hold-to-use action; moving, letting go or walking away cancels it.
func _update_hold(delta: float, dir: Vector2, holding: bool) -> void:
	if hold.is_empty():
		return
	var spot_pos: Vector2 = map.spots[hold.spot].pos
	if dir != Vector2.ZERO or not holding or player.position.distance_to(spot_pos) > USE_RANGE + 4.0:
		hold = {}
		player.busy = false
		return
	player.moving = false
	player.busy = true
	hold_progress += delta
	if hold_progress >= hold.time:
		var finished := hold
		hold = {}
		player.busy = false
		if finished.effect:
			_apply_effect(finished.spot)
		else:
			_complete_beat()

func _apply_effect(spot_id: String) -> void:
	var spot: Dictionary = map.spots[spot_id]
	var effects: Dictionary = spot.effects.duplicate()
	var gained := stats[player_index].apply(effects)
	var offset := 0.0
	for key in gained:
		if gained[key] >= 1.0:
			cues.float_text(player.position + Vector2(0, offset), "+%d %s" % [int(gained[key]), STAT_LABELS[key]], STAT_COLORS[key])
			offset -= 10.0
	if spot.hours > 0.0:
		minutes += spot.hours * 60.0
		hud.show_toast(load("res://assets/ui/items/%s.png" % spot.icon), "Slept %d hours" % int(spot.hours))
	scenery.play("lab_build")

func _check_enter_trigger() -> void:
	var t := story.trigger()
	if t.get("type", "") == "enter" and story.check("enter", map.room_at(player.position), player.id) == Story.Check.OK:
		_complete_beat()

func _check_room() -> void:
	var room := map.room_at(player.position)
	if room != last_room:
		last_room = room
		hud.show_room(map.room_name(room))

func _tint_for(m: float) -> Color:
	var hour := m / 60.0
	for k in range(NIGHT_TINT.size() - 1):
		var a: Array = NIGHT_TINT[k]
		var b: Array = NIGHT_TINT[k + 1]
		if hour >= a[0] and hour <= b[0]:
			return a[1].lerp(b[1], (hour - a[0]) / float(b[0] - a[0]))
	return Color.WHITE

# ── HUD and cues ─────────────────────────────────────────────────────────────
func _update_hud() -> void:
	var gauges: String
	match player_index:
		0: gauges = "MONEY %.2f of 2.5M  TIME %.0f of 24 months" % [forest.state.cost_m + forest.state.reserve_m, forest.state.months]
		1: gauges = "WEIGHT %.1f of %.0fkg  POWER %.0f of %.0fW  BATTERY %.0fWh" % [forest.state.mass_kg, forest.state.mass_limit_kg, forest.state.power_w, forest.state.solar_w, forest.state.battery_wh]
		2: gauges = "CAMERA %s  SARAWAK %s  HEAT CAMERA %s" % ["YES" if forest.state.imager else "NO", "YES" if forest.state.sarawak else "NO", "YES" if forest.state.thermal else "NO"]
		_: gauges = "PHOTOS HOME %.0f%%  RADIO %s-BAND  BACKUP DISH %s" % [forest.state.data_pct, forest.state.radio, "YES" if forest.state.backup_station else "NO"]
	hud.show_mission_gauges(gauges)
	var healths: Array = []
	for s in stats:
		healths.append(s.health / CrewStats.MAX)
	var actor: String = story.current().get("actor", "")
	hud.show_party(player_index, "%s · %s" % [player.info.name, player.info.role], healths, CrewRoster.index_of(actor))
	hud.show_stats(stats[player_index])
	hud.show_clock(day, int(minutes))
	if mission_id == 2:
		var quarter: int = ForestMission.definition(story.current().get("decision", "")).get("quarter", 8 if forest.state.quarters.size() == 7 else 1)
		hud.show_operations_calendar(quarter)
	hud.show_objective(_objective_text())
	var icons: Array[String] = []
	for item in story.inventory:
		icons.append(story.item_icon(item))
	hud.show_inventory(icons)
	var target := objective_position()
	var dots: Array = []
	for c in characters:
		dots.append({"pos": c.position, "color": c.info.color, "is_player": c == player, "facing": c.facing})
	var screen_center := camera.get_screen_center_position()
	hud.show_minimap(dots, target, player.position, map.room_name(map.room_at(player.position)))
	var playing := phase == Phase.PLAYING
	hud.show_edge_arrow(target - screen_center + Vector2(240, 135) if playing and target != Vector2.INF else Vector2.INF)
	_update_cues(playing, target)

func _update_cues(playing: bool, target: Vector2) -> void:
	var t := story.trigger()
	cues.point_at(target if playing else Vector2.INF, t.get("type", "") == "talk")
	if not hold.is_empty():
		cues.show_hold(player.position, hold_progress / hold.time)
	else:
		cues.clear_hold()
	var use := interaction_near() if playing and hold.is_empty() else {}
	if use.is_empty():
		cues.clear_focus()
		hud.show_prompt("", "")
		return
	var color := InteractionCues.WHITE
	var label: String = use.label
	var locked := false
	match use.check:
		Story.Check.OK:
			color = InteractionCues.GOLD
		Story.Check.WRONG_ACTOR:
			color = InteractionCues.RED
			locked = true
			label = "Needs %s  (Tab to switch)" % CrewRoster.CREW[CrewRoster.index_of(story.current().actor)].name
		Story.Check.MISSING_ITEM:
			color = InteractionCues.RED
			locked = true
			label = "Needs the %s" % story.item_name(story.current().needs_item)
	var is_person: bool = use.kind == "talk"
	var focus_pos: Vector2 = use.pos + (Vector2(0, -11) if is_person else Vector2(0, -9))
	cues.show_focus(focus_pos, Vector2(16, 24) if is_person else Vector2(20, 18), color)
	hud.show_prompt("E", label, locked)

func _objective_text() -> String:
	var text := story.objective()
	var actor: String = story.current().get("actor", "")
	if actor != "" and actor != player.id:
		text += "  (%s assists)" % CrewRoster.CREW[CrewRoster.index_of(actor)].name if campaign != null else "  (as %s)" % CrewRoster.CREW[CrewRoster.index_of(actor)].name
	var t := story.trigger()
	if t.get("type", "") == "talk" and t.get("target", "") == player.id:
		text += "  (E: review briefing)" if campaign != null else "  (switch crew)"
	return text

## Where the current objective is, or Vector2.INF if there's nothing to point at.
func objective_position() -> Vector2:
	var t := story.trigger()
	match t.get("type", ""):
		"talk":
			var i := CrewRoster.index_of(t.get("target", ""))
			return characters[i].position if i >= 0 and (characters[i] != player or campaign != null) else Vector2.INF
		"use":
			return map.spots[t.spot].pos + Vector2(0, 4) if map.spots.has(t.get("spot", "")) else Vector2.INF
		"enter":
			return map.rooms[t.room].floor_rect.get_center() if map.rooms.has(t.get("room", "")) else Vector2.INF
	return Vector2.INF

# ── interaction ──────────────────────────────────────────────────────────────
## The thing in reach, preferring the story's target, then useful spots, then people:
## {kind, target, label, pos, check} or {}.
func interaction_near() -> Dictionary:
	var options: Array[Dictionary] = []
	if campaign != null and story.trigger().get("type", "") == "talk" and story.trigger().get("target", "") == player.id:
		options.append({"kind": "talk", "target": player.id, "label": "Review " + player.info.name + "'s briefing", "pos": player.position})
	for c in characters:
		if c != player and c.position.distance_to(player.position) <= TALK_RANGE:
			options.append({"kind": "talk", "target": c.id, "label": "Talk to " + c.info.name, "pos": c.position})
	for id in map.spots:
		var spot: Dictionary = map.spots[id]
		if player.position.distance_to(spot.pos) <= USE_RANGE:
			var label: String = spot.verb if spot.verb != "" else spot.name
			options.append({"kind": "use", "target": id, "label": label, "pos": spot.pos})
	var best := {}
	var best_rank := 99
	for o in options:
		o["check"] = story.check(o.kind, o.target, player.id)
		if campaign != null and o.check == Story.Check.WRONG_ACTOR:
			# The player requests the specialist's help instead of changing character.
			o["check"] = story.check(o.kind, o.target, story.current().actor)
			o.label = "Assist " + CrewRoster.CREW[CrewRoster.index_of(story.current().actor)].name
		var rank := 3
		if o.check != Story.Check.NO_MATCH:
			rank = 0
		elif o.kind == "use" and not map.spots[o.target].effects.is_empty():
			rank = 1
		elif o.kind == "talk":
			rank = 2
		if rank < best_rank:
			best_rank = rank
			best = o
	return best

func interact() -> void:
	var o := interaction_near()
	if o.is_empty():
		return
	if o.kind == "talk":
		var other := characters[CrewRoster.index_of(o.target)]
		other.face(player.position - other.position)
		player.face(other.position - player.position)
	match o.check:
		Story.Check.OK:
			if o.kind == "use" and story.hold_time() > 0.0:
				_start_hold(o.target, story.hold_time(), false)
			else:
				_complete_beat()
		Story.Check.WRONG_ACTOR:
			var actor: String = story.current().actor
			player.say("This is a job for %s. (Tab to switch)" % CrewRoster.CREW[CrewRoster.index_of(actor)].name, 3.0)
			scenery.play("denied")
		Story.Check.MISSING_ITEM:
			player.say("I need the %s first." % story.item_name(story.current().needs_item).to_lower(), 3.0)
			scenery.play("denied")
		_:
			if o.kind == "talk":
				var lines := story.chatter_for(o.target)
				if not lines.is_empty():
					characters[CrewRoster.index_of(o.target)].say(lines[rng.randi_range(0, lines.size() - 1)], 3.0)
			elif not map.spots[o.target].effects.is_empty():
				_start_hold(o.target, EFFECT_HOLD, true)
			else:
				player.say("Nothing to do here right now.", 2.0)

func _start_hold(spot_id: String, seconds: float, is_effect: bool) -> void:
	if campaign != null and not is_effect:
		var actor: String = story.current().get("actor", "")
		if actor != "" and actor != player.id:
			characters[CrewRoster.index_of(actor)].say("I'll handle the specialist work. Help me here.", seconds + 1.0)
		if actor == player.id:
			seconds *= 0.75
	hold = {"spot": spot_id, "time": seconds, "effect": is_effect}
	hold_progress = 0.0
	player.face(map.spots[spot_id].pos - player.position + Vector2(0, -1))

func _unhandled_input(event: InputEvent) -> void:
	if is_instance_valid(activity):
		return
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	var key: int = event.keycode
	if key in [KEY_H, KEY_ESCAPE] and phase in [Phase.PLAYING, Phase.DIALOGUE, Phase.PAUSED]:
		if hud.minimap.visible and key == KEY_ESCAPE:
			hud.minimap.hide()
		else:
			_toggle_pause()
		get_viewport().set_input_as_handled()
		return
	match phase:
		Phase.DIALOGUE:
			if key in [KEY_E, KEY_SPACE, KEY_ENTER, KEY_KP_ENTER]:
				_advance_dialogue()
		Phase.ENDING:
			if key in [KEY_ENTER, KEY_KP_ENTER] and hud.card.visible:
				if campaign != null:
					if not mission_recorded and not campaign.finish_mission(mission_id):
						return
					get_tree().change_scene_to_file("res://scenes/menu.tscn")
				else:
					start_chapter()
		Phase.PLAYING:
			if key in [KEY_E, KEY_SPACE, KEY_ENTER]:
				if hold.is_empty():
					interact()
			elif key == KEY_TAB:
				var current := view_index if view_index >= 0 else player_index
				switch_to(posmod(current + (-1 if event.shift_pressed else 1), characters.size()))
			elif key >= KEY_1 and key <= KEY_4:
				switch_to(key - KEY_1)
			elif key == KEY_N:
				hud.toggle_minimap()
			elif key == KEY_M:
				if hud.minimap.visible:
					hud.minimap.hide()
				else:
					hud.minimap.show_map(map, "STATION MAP", _map_markers())
			else:
				return
		_:
			return
	get_viewport().set_input_as_handled()

func _toggle_pause() -> void:
	if phase == Phase.PAUSED:
		phase = paused_from
		hud.toggle_help(false)
	else:
		paused_from = phase
		phase = Phase.PAUSED
		player.moving = false
		hud.toggle_help(true)

func _map_markers() -> Array:
	var out: Array = []
	var target := objective_position()
	if target != Vector2.INF:
		out.append({"pos": target, "color": Color("#f2c94c"), "size": 4.0})
	for id in map.spots:
		if not map.spots[id].effects.is_empty():
			out.append({"pos": map.spots[id].pos, "color": Color("#8fd694"), "size": 2.0})
	for c in characters:
		out.append({"pos": c.position, "color": c.info.color, "size": 3.5 if c == player else 2.5})
	return out

func _on_step(surface: String, at: Vector2, member: CrewMember) -> void:
	scenery.puff(at)
	if member == player:
		scenery.step(surface)

func _on_help_button() -> void:
	if phase in [Phase.PLAYING, Phase.DIALOGUE, Phase.PAUSED] and not is_instance_valid(activity):
		_toggle_pause()

## EXIT button: finished steps are already saved, so just go back to mission select.
func _exit_to_menu() -> void:
	if campaign != null:
		_save_story_progress()
	get_tree().change_scene_to_file("res://scenes/menu.tscn")
