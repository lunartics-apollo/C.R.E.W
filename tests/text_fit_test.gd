extends SceneTree
## Every decision card must fit its box: one-line option titles and details, a prompt of at most
## two lines, hints of at most two lines, and all option boxes above the hint line.

const DETAIL_W := 430.0
const PROMPT_W := 412.0
const HINT_W := 448.0

var problems: Array[String] = []

func _initialize() -> void:
	call_deferred("run")

func lines_needed(label: Label) -> int:
	return label.get_line_count()

func run() -> void:
	var font_theme: Theme = PixelFont.theme()
	for id in ForestMission.DESIGN_IDS + ForestMission.EVENT_IDS:
		var mission := ForestMission.new()
		var activity = load("res://scripts/mission_activity.gd").new()
		activity.setup(mission, id)
		root.add_child(activity)
		await process_frame
		await process_frame
		var body: Control = activity.get_node("Choices")
		var choices: Array = activity.definition.choices
		var bottom := 0.0
		for i in choices.size():
			var button: Button = body.get_node("Option%d" % i)
			bottom = maxf(bottom, button.position.y + button.size.y)
			var labels: Array = button.get_children().filter(func(n): return n is Label)
			for label in labels:
				var font: Font = label.get_theme_font("font")
				var size: int = label.get_theme_font_size("font_size")
				var width := font.get_string_size(label.text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
				if label.text == ">":
					continue
				# Titles share their row with the stat badges; details have the whole width.
				var limit: float = 190.0 if label.position.y < 10 else 430.0
				if width > limit:
					problems.append("%s option %d: '%s' is %.0f px wide (max %.0f)" % [id, i + 1, label.text.left(40), width, limit])
			var badges: RichTextLabel = button.get_node("Badges")
			if badges.get_content_width() > 244:
				problems.append("%s option %d stat badges are too wide (%d px)" % [id, i + 1, badges.get_content_width()])
			if button.position.y + button.size.y > 246:
				problems.append("%s option %d runs below the box (%.0f)" % [id, i + 1, button.position.y + button.size.y])
		var prompt: Label = body.get_node("Prompt")
		if prompt.get_line_count() > 2:
			problems.append("%s prompt wraps to %d lines" % [id, prompt.get_line_count()])
		var hint_text: String = activity.hint.text
		var hint_font: Font = activity.hint.get_theme_font("font")
		var hint_size: int = activity.hint.get_theme_font_size("font_size")
		if hint_font.get_string_size(hint_text, HORIZONTAL_ALIGNMENT_LEFT, HINT_W, hint_size).y > 22:
			problems.append("%s decision hint is too tall" % id)
		if hint_font.get_string_size(hint_text, HORIZONTAL_ALIGNMENT_LEFT, -1, hint_size).x > HINT_W:
			problems.append("%s clue is wider than one line: %s" % [id, hint_text.left(50)])
		var gauge_font: Font = activity.gauges.get_theme_font("normal_font")
		if gauge_font.get_string_size(activity.gauges.get_parsed_text(), HORIZONTAL_ALIGNMENT_LEFT, -1, activity.gauges.get_theme_font_size("normal_font_size")).x > HINT_W:
			problems.append("%s gauge line is too wide" % id)
		# The puzzle screen shows the card's own hint on a single line at the bottom.
		var puzzle_hint: String = str(activity.definition.get("hint", ""))
		if hint_font.get_string_size(puzzle_hint, HORIZONTAL_ALIGNMENT_LEFT, -1, hint_size).x > HINT_W:
			problems.append("%s puzzle hint is wider than one line: %s" % [id, puzzle_hint.left(40)])
		activity.queue_free()
		await process_frame
	for problem in problems:
		print("FIT PROBLEM: ", problem)
	assert(problems.is_empty(), "%d text-fit problems" % problems.size())
	print("Text fit: every decision card fits its boxes")
	quit()
