extends Control
## Read-only, labelled mission schematics. No fabricated live observations.
const GOLD := Color("#e8bf83")
const TEAL := Color("#8ac6b4")
const WHITE := Color("#e8eed8")
var view := "map"
var stage := 0
var clock := 0.0
var reduced_motion := false
var forest: ForestMission
var title: Label
var caption: Label

func _ready() -> void:
	size = Vector2(208, 120)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var ui = preload("res://scripts/preflight.gd")
	title = ui.label_at(self, "", Vector2(8, 5), 194, 8, GOLD)
	caption = ui.label_at(self, "", Vector2(8, 103), 192, 8, TEAL)
	refresh()

func refresh() -> void:
	if title == null:
		return
	var titles := {"map": "SARAWAK / BORNEO", "satellite": "FOREST-WATCH CUBESAT", "power": "POWER / ECLIPSE", "passes": "KUCHING / DOWNLINK", "timeline": "MISSION LIFECYCLE", "requirements": "FLIGHT REQUIREMENTS"}
	title.text = titles.get(view, "MISSION INTELLIGENCE")
	var captions := {"map": "COVERAGE SCHEMATIC / NOT LIVE", "satellite": "IMAGER / SOLAR / RADIO", "power": "35 MIN SHADOW / LEAVE MARGIN", "passes": "RETURN AT LEAST 70% OF DATA", "timeline": "TWO YEARS / ONE SHARED PLAN", "requirements": "OPEN INTEL FOR EXACT NUMBERS"}
	caption.text = captions.get(view, "SCHEMATIC")
	queue_redraw()

func _process(delta: float) -> void:
	if not reduced_motion:
		clock += delta
		queue_redraw()

func text(at: Vector2, value: String, color := WHITE) -> void:
	draw_string(PixelFont.font(), at, value, HORIZONTAL_ALIGNMENT_LEFT, -1, 9, color)

func _draw() -> void:
	draw_rect(Rect2(0, 0, 208, 120), Color("#102932"))
	for x in range(8, 207, 16):
		draw_line(Vector2(x, 20), Vector2(x, 99), Color("#1c3b43"))
	for y in range(20, 101, 13):
		draw_line(Vector2(8, y), Vector2(200, y), Color("#1c3b43"))
	match view:
		"map":
			var points := PackedVector2Array([Vector2(48, 37), Vector2(67, 29), Vector2(81, 33), Vector2(101, 23), Vector2(114, 32), Vector2(136, 35), Vector2(157, 45), Vector2(163, 57), Vector2(147, 65), Vector2(138, 81), Vector2(116, 88), Vector2(97, 91), Vector2(76, 82), Vector2(68, 68), Vector2(53, 64), Vector2(45, 49)])
			draw_colored_polygon(points, Color("#496f59"))
			draw_polyline(points + PackedVector2Array([points[0]]), TEAL, 1)
			draw_polyline(PackedVector2Array([Vector2(48, 42), Vector2(73, 48), Vector2(93, 38), Vector2(113, 41)]), GOLD, 3)
			draw_circle(Vector2(62, 50), 3, GOLD)
			draw_line(Vector2(62, 50), Vector2(28, 73), GOLD)
			text(Vector2(13, 86), "KUCHING", GOLD)
			text(Vector2(119, 65), "BORNEO")
			if not reduced_motion:
				var sweep := 24 + fmod(clock * 12, 69)
				draw_line(Vector2(42, sweep), Vector2(166, sweep), Color("#94c6b130"))
		"satellite":
			draw_line(Vector2(27, 64), Vector2(179, 64), TEAL, 2)
			for x in [19, 132]:
				draw_rect(Rect2(x, 43, 56, 43), Color("#254963"))
				draw_rect(Rect2(x, 43, 56, 43), TEAL, false)
				for i in 5:
					draw_line(Vector2(x + 5 + i * 10, 44), Vector2(x + 5 + i * 10, 85), Color("#5d84a0"))
				for j in 3:
					draw_line(Vector2(x, 52 + j * 10), Vector2(x + 55, 52 + j * 10), Color("#5d84a0"))
			draw_colored_polygon(PackedVector2Array([Vector2(82, 40), Vector2(107, 33), Vector2(128, 43), Vector2(102, 51)]), Color("#edce91"))
			draw_colored_polygon(PackedVector2Array([Vector2(82, 40), Vector2(102, 51), Vector2(102, 86), Vector2(82, 74)]), Color("#b49662"))
			draw_colored_polygon(PackedVector2Array([Vector2(102, 51), Vector2(128, 43), Vector2(128, 78), Vector2(102, 86)]), Color("#766e54"))
			draw_circle(Vector2(113, 66), 7, Color("#101f30"))
			draw_circle(Vector2(111, 64), 3, TEAL)
			draw_line(Vector2(111, 35), Vector2(121, 23), GOLD)
		"power":
			var watts: float = forest.state.power_w if forest != null else 15
			var solar: float = forest.state.solar_w if forest != null else 35
			var battery: float = forest.state.battery_wh if forest != null else 40
			text(Vector2(10, 38), "SOLAR %.0f W" % solar, TEAL)
			text(Vector2(112, 38), "LOAD %.1f W" % watts, GOLD)
			for i in 10:
				draw_rect(Rect2(14 + i * 18, 48, 14, 19), TEAL if i / 10.0 < watts / maxf(1, solar) else Color("#2d4850"))
			draw_rect(Rect2(14, 78, 181, 14), TEAL, false)
			draw_rect(Rect2(16, 80, clampf(battery / 80, 0, 1) * 177, 10), GOLD)
			text(Vector2(75, 89), "%.0f Wh" % battery, WHITE)
		"passes":
			for i in 4:
				var x := 15 + i * 47
				draw_rect(Rect2(x, 43, 35, 28), Color("#355f65"))
				draw_rect(Rect2(x + 2, 45, 31, 24), TEAL, false)
				text(Vector2(x + 3, 62), "%d" % (i + 1))
			draw_line(Vector2(12, 83), Vector2(199, 83), GOLD)
			var travel: float = 12 + (fmod(clock * 25, 187) if not reduced_motion else 70)
			draw_circle(Vector2(travel, 83), 3, GOLD)
			text(Vector2(14, 32), "PASS WINDOWS / DATA TANK", TEAL)
		"timeline":
			var count := 8 if stage == 2 else 6
			var labels := ["DEF", "DES", "REV", "LCH", "OPS", "RPT"]
			for i in count:
				var x := 15 + i * (181.0 / count)
				var active := i <= (int(forest.state.quarters.size()) if stage == 2 and forest != null else stage * 2)
				draw_rect(Rect2(x, 48, 181.0 / count - 4, 25), GOLD if active else Color("#32525b"))
				text(Vector2(x, 87), str(i + 1) if stage == 2 else labels[i], TEAL)
			text(Vector2(14, 34), "Q1-Q8 / TWO YEARS" if stage == 2 else "DEFINE TO REPORT")
		"requirements":
			var labels := ["CAMERA ON BOARD", "COVERS SARAWAK", "PHOTOS HOME 70%+", "LASTS 2 YEARS", "COST UNDER 2.5 M", "WEIGHT FITS ROCKET", "READY IN 24 MONTHS"]
			var checks: Array = forest.requirements() if forest != null else []
			for i in labels.size():
				var okay: bool = checks.is_empty() or checks[i].met
				draw_rect(Rect2(10, 25 + i * 10, 4, 4), TEAL if okay else GOLD)
				text(Vector2(20, 30 + i * 10), labels[i], TEAL if okay else GOLD)
