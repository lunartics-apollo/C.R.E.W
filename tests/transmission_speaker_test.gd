extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var script = load("res://scripts/transmission_speaker.gd")
	assert(script != null, "Frame-based transmission speaker exists")
	var speaker = script.new()
	root.add_child(speaker)
	var previous_texture: Texture2D
	for id in ["aisyah", "hamdan", "jabu", "ling", "siti"]:
		for mood in script.EXPRESSIONS:
			speaker.present(id, mood)
			assert(speaker.sprite.texture != null, "Original cast atlas loads: " + id)
			assert(speaker.sprite.frame_coords.y == script.EXPRESSIONS.find(mood))
			assert(speaker.sprite.hframes == 4 and speaker.sprite.vframes == 9)
			assert(speaker.sprite.texture.get_size() == Vector2(384, 1008))
		if previous_texture != null:
			assert(speaker.sprite.texture != previous_texture, "Each character uses distinct art")
		previous_texture = speaker.sprite.texture
	var text := "Hello, Sarawak!"
	speaker.present("aisyah", "smile")
	speaker.set_delivery(text, 2, false)
	assert(speaker.speaking and speaker.mouth_frame > 0 and speaker.speech_level > 0.0)
	var repeat_frame: int = speaker.mouth_frame
	speaker.set_delivery(text, 2, false)
	assert(speaker.mouth_frame == repeat_frame, "Subtitle visemes are repeatable")
	speaker.set_delivery(text, 6, false)
	assert(speaker.mouth_frame == 0 and speaker.speech_level == 0.0, "Punctuation pauses speech")
	speaker.set_delivery(text, 7, false)
	assert(speaker.mouth_frame == 0, "Spaces close the mouth")
	for punctuation in ["(", ")", "/", "…", "—"]:
		speaker.set_delivery("a" + punctuation + "a", 2, false)
		assert(speaker.mouth_frame == 0, "All punctuation closes the mouth")
	speaker.set_mouth_frame(3)
	assert(speaker.mouth_frame == 3, "Optional recorded mouth cues override subtitle cues")
	speaker.set_delivery(text, -1, true)
	assert(not speaker.speaking and speaker.mouth_frame == 0 and speaker.speech_level == 0.0)
	speaker.set_mouth_frame(3)
	assert(speaker.mouth_frame == 0, "Stale mouth cues cannot restart finished speech")
	speaker.set_delivery(text, text.length(), false)
	assert(not speaker.speaking, "A complete subtitle never keeps talking")
	speaker.set_delivery(text, 3, false)
	speaker.stop()
	assert(not speaker.speaking and speaker.mouth_frame == 0 and speaker.speech_level == 0.0)
	speaker.present("aisyah", "smile")
	speaker._process(3.3)
	assert(speaker.sprite.frame_coords.y == script.EXPRESSIONS.find("blink"), "Speaker blinks naturally")
	speaker._process(0.15)
	assert(speaker.sprite.frame_coords.y == script.EXPRESSIONS.find("smile"), "Blink returns to the expression")
	for tick in 60:
		speaker._process(0.1)
		assert(absf(speaker.sprite.position.y) <= 1.0, "Head bob stays within one native pixel")
	speaker.reduced_motion = true
	speaker.set_delivery(text, 4, false)
	var origin: Vector2 = speaker.sprite.position
	for tick in 100:
		speaker._process(0.1)
		assert(speaker.sprite.position == origin, "Reduced motion holds the portrait still")
	var content = JSON.parse_string(FileAccess.get_file_as_string("res://data/briefings.json"))
	assert(content is Dictionary and content.stages.size() == 3 and content.speakers.size() == 5)
	var introduced := {}
	for stage in content.stages:
		assert(stage.objectives.size() >= 3 and stage.objectives.size() <= 4)
		for segment in stage.segments:
			assert(content.speakers.has(segment.speaker) and segment.text.length() <= 140)
			assert(segment.expression in script.EXPRESSIONS)
			assert(segment.intel in ["map", "satellite", "power", "passes", "timeline", "requirements"])
			if stage == content.stages[0]:
				introduced[segment.speaker] = true
	assert(introduced.size() == 5, "All five story speakers appear in the first briefing")
	assert(content.endings.size() == 8)
	speaker.queue_free()
	print("Transmission cast expressions, subtitle visemes, skip, reduced motion and canonical briefings passed")
	quit()
