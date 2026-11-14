extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var script = load("res://scripts/transmission.gd")
	assert(script != null, "Interactive transmission exists")
	var campaign := Campaign.new("user://transmission_campaign_test.json")
	campaign.character = -1
	campaign.completed.clear()
	campaign.forest.reset()
	campaign.beats.clear()
	var before := JSON.stringify(campaign.forest.state)
	var preferences = load("res://scripts/briefing_settings.gd").new("user://transmission_settings_test.cfg")
	preferences.reduced_motion = true
	preferences.seen.clear()
	preferences.volume = 0.5
	var monitor = script.new()
	monitor.setup(campaign, 0, preferences)
	root.add_child(monitor)
	assert(monitor.phase == monitor.Phase.INCOMING)
	assert(monitor.sfx.playing, "The incoming communication cue is routed to playback")
	monitor.skip_animation()
	assert(monitor.phase == monitor.Phase.SPEAKING)
	assert(monitor.actor.speaker_id == monitor.segments[0].speaker)
	monitor.advance_line()
	assert(monitor.shown_chars >= monitor.segments[0].text.length())
	monitor.advance_line()
	assert(monitor.segment_index == 1)
	monitor.replay()
	monitor.skip_animation()
	assert(monitor.segment_index == 0)
	monitor.navigate_stage(1)
	assert(monitor.stage == 1 and monitor.accept_button.disabled)
	monitor.navigate_stage(-1)
	monitor.skip_animation()
	monitor.show_intel()
	assert(monitor.dossier.visible)
	var frozen: float = monitor.shown_chars
	monitor._process(0.3)
	assert(monitor.shown_chars == frozen and not monitor.actor.speaking, "Intelligence reading pauses delivery")
	monitor.show_intel()
	monitor.show_settings()
	assert(monitor.accept_button.disabled, "Settings cannot activate a mission behind the modal")
	monitor.preferences.subtitles = false
	monitor._settings_changed()
	monitor.show_settings()
	monitor._process(0.3)
	assert(monitor.subtitle.text.begins_with("CAPTIONS OFF"))
	assert(monitor.actor.speaking, "Caption visibility does not remove the talking character")
	assert(JSON.stringify(campaign.forest.state) == before)
	assert(campaign.completed.is_empty() and campaign.character == -1)
	var outcome := {"accepted": 0, "declined": 0}
	monitor.accepted.connect(func(_stage): outcome.accepted += 1)
	monitor.declined.connect(func(): outcome.declined += 1)
	monitor.accept_mission()
	monitor.decline()
	await create_timer(0.5).timeout
	assert(outcome.accepted == 0 and outcome.declined == 1, "Cancel stops pending authorization callbacks")
	monitor.queue_free()
	await process_frame
	var seen_before: Array = preferences.seen.duplicate()
	monitor = script.new()
	monitor.setup_report(campaign, campaign.forest.report(), preferences)
	root.add_child(monitor)
	assert(monitor.kind == "report" and monitor.actor.speaker_id == "hamdan")
	monitor.accept_mission()
	monitor.advance_line()
	assert(monitor.phase == monitor.Phase.CLOSED)
	assert(JSON.stringify(campaign.forest.state) == before and preferences.seen == seen_before, "Ending playback does not mutate the project or mark another stage seen")
	monitor.queue_free()
	await process_frame
	# Replaying during power-on must cancel the old choreography and its audio.
	monitor = script.new()
	preferences.reduced_motion = false
	preferences.seen.clear()
	monitor.setup(campaign, 0, preferences)
	root.add_child(monitor)
	monitor.open_link()
	assert(monitor.phase == monitor.Phase.BOOTING)
	monitor.replay()
	await create_timer(2).timeout
	assert(monitor.phase == monitor.Phase.SPEAKING and monitor.segment_index == 0)
	monitor.decline()
	assert(not monitor.sfx.playing and not monitor.speech_fx.playing and not monitor.voice.playing)
	monitor.queue_free()
	await process_frame
	preferences.reduced_motion = true
	monitor = script.new()
	monitor.setup(campaign, 0, preferences)
	root.add_child(monitor)
	monitor.accepted.connect(func(_stage): outcome.accepted += 1)
	monitor.skip_animation()
	monitor.accept_mission()
	await create_timer(0.5).timeout
	assert(outcome.accepted == 1)
	assert(JSON.stringify(campaign.forest.state) == before)
	monitor.queue_free()
	await process_frame
	DirAccess.remove_absolute("user://transmission_settings_test.cfg")
	print("Transmission navigation, skip/replay, stage gates, cancellation and campaign immutability passed")
	quit()
