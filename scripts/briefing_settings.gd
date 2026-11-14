class_name BriefingSettings
extends RefCounted

var reduced_motion := false
var subtitles := true
var characters_per_second := 38.0
var volume := 0.65
var seen: Array[int] = []
var path: String

func _init(file_path := "user://transmission_settings.cfg") -> void:
	path = file_path
	var config := ConfigFile.new()
	if config.load(path) != OK:
		return
	var motion = config.get_value("display", "reduced_motion", false)
	var captions = config.get_value("display", "subtitles", true)
	reduced_motion = motion if motion is bool else false
	subtitles = captions if captions is bool else true
	var speed = config.get_value("display", "speed", 38.0)
	if (speed is float or speed is int) and is_finite(speed):
		characters_per_second = clampf(speed, 0, 100)
	var gain = config.get_value("audio", "volume", 0.65)
	if (gain is float or gain is int) and is_finite(gain):
		volume = clampf(gain, 0, 1)
	var stages = config.get_value("briefings", "seen", [])
	if stages is Array:
		for stage in stages:
			if stage is int and stage >= 0 and stage < 3 and not seen.has(stage):
				seen.append(stage)

func save() -> Error:
	var config := ConfigFile.new()
	config.set_value("display", "reduced_motion", reduced_motion)
	config.set_value("display", "subtitles", subtitles)
	config.set_value("display", "speed", characters_per_second)
	config.set_value("audio", "volume", volume)
	config.set_value("briefings", "seen", seen)
	return config.save(path)

func mark_seen(stage: int) -> void:
	if stage >= 0 and stage < 3 and not seen.has(stage):
		seen.append(stage)
	save()
