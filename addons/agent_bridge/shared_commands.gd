@tool
extends RefCounted
## Helpers used by both the editor bridge and the in-game runtime bridge.

const Codec := preload("res://addons/agent_bridge/codec.gd")


static func vec2i(v) -> Vector2i:
	if typeof(v) == TYPE_ARRAY:
		return Vector2i(int(v[0]), int(v[1]))
	if typeof(v) == TYPE_VECTOR2I:
		return v
	if typeof(v) == TYPE_VECTOR2:
		return Vector2i(v)
	return Vector2i(int(v), int(v))


# ---------------------------------------------------------------- logs

static func get_logs(logs: Object, a: Dictionary) -> Dictionary:
	if logs == null:
		return {"entries": [], "next": 0}
	if a.get("clear", false):
		logs.clear()
		return {"cleared": true, "next": logs.mark()}
	var kinds: Array = a.get("kinds", [])
	if a.get("errors_only", false):
		kinds = ["error", "script_error", "shader_error", "warning"]
	var entries: Array = logs.since(int(a.get("since", 0)), kinds, int(a.get("limit", 200)))
	var lines: PackedStringArray = []
	for e in entries:
		lines.append("[%d %s] %s" % [e.seq, e.kind, e.text])
	return {"log": "\n".join(lines), "count": entries.size(), "next": logs.mark()}


# ---------------------------------------------------------------- images

static func image_result(img: Image, tag: String, max_width := 1280, min_width := 640) -> Dictionary:
	# Small (pixel-art) viewports are upscaled by an integer factor so details stay visible.
	if min_width > 0 and img.get_width() < min_width and img.get_width() > 0:
		var k := ceili(float(min_width) / img.get_width())
		img.resize(img.get_width() * k, img.get_height() * k, Image.INTERPOLATE_NEAREST)
	if img.get_width() > max_width and max_width > 0:
		var h := int(round(img.get_height() * float(max_width) / img.get_width()))
		img.resize(max_width, h, Image.INTERPOLATE_BILINEAR)
	if img.get_format() != Image.FORMAT_RGBA8 and img.get_format() != Image.FORMAT_RGB8:
		img.convert(Image.FORMAT_RGBA8)
	var dir := OS.get_user_data_dir().path_join("agent_screenshots")
	DirAccess.make_dir_recursive_absolute(dir)
	var path := dir.path_join("%s_%d.png" % [tag, Time.get_ticks_msec()])
	var buf := img.save_png_to_buffer()
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_buffer(buf)
		f.close()
	return {"path": path, "width": img.get_width(), "height": img.get_height(), "png_base64": Marshalls.raw_to_base64(buf)}


# ---------------------------------------------------------------- exec

## Compiles and runs agent-supplied GDScript.
## `code` is either a function body (use `return` to send back a value) or a full script
## that defines `func run():`. Members from the context base script are available
## (root, node(path), etc.).
static func exec_gdscript(code: String, ctx: Dictionary, logs: Object, base_path: String) -> Variant:
	var src := ""
	if code.contains("func run("):
		src = code if code.strip_edges().begins_with("@tool") or code.contains("extends ") else "@tool\nextends \"%s\"\n%s" % [base_path, code]
	else:
		var indent := "    " if _uses_spaces(code) else "\t"
		var body := PackedStringArray()
		for line in code.split("\n"):
			body.append(indent + line)
		src = "@tool\nextends \"%s\"\n\nfunc run():\n%s\n%spass\n" % [base_path, "\n".join(body), indent]
	var mark: int = logs.mark() if logs else 0
	var scr := GDScript.new()
	scr.source_code = src
	var err := scr.reload()
	if err != OK:
		var errs: Array = logs.errors_since(mark) if logs else []
		var offset := 0 if code.contains("func run(") else 4
		var re := RegEx.create_from_string("gdscript://-?\\d+\\.gd:(\\d+)")
		var fixed: Array = []
		for e in errs:
			var m := re.search(e)
			while m:
				e = e.replace(m.get_string(), "<your code> line %d" % (int(m.get_string(1)) - offset))
				m = re.search(e)
			fixed.append(e)
		return Codec.fail("GDScript compile error:\n%s" % "\n".join(fixed if not fixed.is_empty() else [error_string(err)]))
	var obj = scr.new()
	for k in ctx:
		if k in obj:
			obj.set(k, ctx[k])
	var result = await obj.run()
	if obj is Node and not obj.is_inside_tree():
		obj.free()
	return result


static func _uses_spaces(code: String) -> bool:
	for line in code.split("\n"):
		if line.begins_with(" "):
			return true
		if line.begins_with("\t"):
			return false
	return false


# ---------------------------------------------------------------- script validation

static func validate_script_file(path: String, logs: Object) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"ok": false, "errors": ["File not found: %s" % path]}
	var mark: int = logs.mark() if logs else 0
	var scr = ResourceLoader.load(path, "", ResourceLoader.CACHE_MODE_IGNORE)
	var entries: Array = logs.since(mark, ["error", "script_error", "warning"], 50) if logs else []
	var ok: bool = scr is Script and not entries.any(func(e): return e.kind != "warning")
	var errs: Array = entries.map(func(e): return "%s: %s" % [e.kind, e.text])
	return {"ok": ok, "errors": errs}


static func validate_script_source(source: String, logs: Object) -> Dictionary:
	# Drop class_name so the copy does not clash with the real global class.
	var re := RegEx.create_from_string("(?m)^class_name\\s+\\w+.*$")
	var mark: int = logs.mark() if logs else 0
	var scr := GDScript.new()
	scr.source_code = re.sub(source, "", true)
	var err := scr.reload()
	var errs: Array = logs.since(mark, ["error", "script_error", "warning"], 50).map(func(e): return "%s: %s" % [e.kind, e.text]) if logs else []
	return {"ok": err == OK, "errors": errs}


# ---------------------------------------------------------------- class docs

static func class_info(name: String) -> Variant:
	if ClassDB.class_exists(name):
		var chain: PackedStringArray = []
		var c := ClassDB.get_parent_class(name)
		while not c.is_empty():
			chain.append(c)
			c = ClassDB.get_parent_class(c)
		var props: PackedStringArray = []
		for p in ClassDB.class_get_property_list(name, true):
			if p.usage & (PROPERTY_USAGE_CATEGORY | PROPERTY_USAGE_GROUP | PROPERTY_USAGE_SUBGROUP):
				continue
			var def = ClassDB.class_get_property_default_value(name, p.name)
			props.append("%s: %s = %s" % [p.name, _type_name(p), var_to_str(def) if def != null else "null"])
		var methods: PackedStringArray = []
		for m in ClassDB.class_get_method_list(name, true):
			if str(m.name).begins_with("_") and not (m.flags & METHOD_FLAG_VIRTUAL):
				continue
			methods.append(_method_sig(m))
		var signals: PackedStringArray = []
		for s in ClassDB.class_get_signal_list(name, true):
			signals.append(_method_sig(s, false))
		var enums := {}
		for e in ClassDB.class_get_enum_list(name, true):
			enums[e] = ", ".join(ClassDB.class_get_enum_constants(name, e, true))
		var inheriters := ClassDB.get_inheriters_from_class(name)
		return {
			"class": name, "inherits": " < ".join(chain),
			"properties": props, "methods": methods, "signals": signals, "enums": enums,
			"direct_inheriters": Array(inheriters).filter(func(x): return ClassDB.get_parent_class(x) == name),
			"note": "Own members only; query the parent classes for inherited ones.",
		}
	for g in ProjectSettings.get_global_class_list():
		if g["class"] == name:
			var scr: Script = load(g.path)
			return {
				"class": name, "script": g.path, "base": g.base,
				"properties": scr.get_script_property_list().filter(func(p): return p.usage & PROPERTY_USAGE_SCRIPT_VARIABLE).map(func(p): return "%s: %s" % [p.name, _type_name(p)]),
				"methods": scr.get_script_method_list().map(func(m): return _method_sig(m)),
				"signals": scr.get_script_signal_list().map(func(s): return _method_sig(s, false)),
			}
	return Codec.fail("Unknown class '%s'. Try class.search." % name)


static func class_search(query: String, base: String) -> Array:
	var q := query.to_lower()
	var out: Array = []
	var pool := ClassDB.get_inheriters_from_class(base) if not base.is_empty() else ClassDB.get_class_list()
	for c in pool:
		if q.is_empty() or str(c).to_lower().contains(q):
			out.append(c)
	for g in ProjectSettings.get_global_class_list():
		if q.is_empty() or str(g["class"]).to_lower().contains(q):
			out.append("%s (script: %s)" % [g["class"], g.path])
	out.sort()
	return out.slice(0, 150)


static func _type_name(p: Dictionary) -> String:
	if p.type == TYPE_OBJECT:
		if not str(p.class_name).is_empty():
			return p.class_name
		if p.hint == PROPERTY_HINT_RESOURCE_TYPE:
			return p.hint_string
		return "Object"
	if p.type == TYPE_INT and p.hint in [PROPERTY_HINT_ENUM, PROPERTY_HINT_FLAGS] and not str(p.hint_string).is_empty():
		return "int(%s)" % p.hint_string
	if p.type == TYPE_NIL:
		return "Variant"
	return type_string(p.type)


static func _method_sig(m: Dictionary, with_ret := true) -> String:
	var args: PackedStringArray = []
	var defs: Array = m.get("default_args", [])
	var first_def: int = m.args.size() - defs.size()
	for i in m.args.size():
		var a: Dictionary = m.args[i]
		var s := "%s: %s" % [a.name, _type_name(a)]
		if i >= first_def:
			s += " = %s" % var_to_str(defs[i - first_def])
		args.append(s)
	if m.get("flags", 0) & METHOD_FLAG_VARARG:
		args.append("...")
	var sig := "%s(%s)" % [m.name, ", ".join(args)]
	if with_ret and m.has("return"):
		var r := _type_name(m["return"])
		if r != "Variant" or m["return"].usage & PROPERTY_USAGE_NIL_IS_VARIANT:
			sig += " -> %s" % r
		else:
			sig += " -> void"
	if m.get("flags", 0) & METHOD_FLAG_VIRTUAL:
		sig = "virtual " + sig
	if m.get("flags", 0) & METHOD_FLAG_STATIC:
		sig = "static " + sig
	return sig


# ---------------------------------------------------------------- input

const _MOUSE := {"left": MOUSE_BUTTON_LEFT, "right": MOUSE_BUTTON_RIGHT, "middle": MOUSE_BUTTON_MIDDLE,
	"wheel_up": MOUSE_BUTTON_WHEEL_UP, "wheel_down": MOUSE_BUTTON_WHEEL_DOWN}
const _AXES := {"left_x": JOY_AXIS_LEFT_X, "left_y": JOY_AXIS_LEFT_Y, "right_x": JOY_AXIS_RIGHT_X,
	"right_y": JOY_AXIS_RIGHT_Y, "trigger_left": JOY_AXIS_TRIGGER_LEFT, "trigger_right": JOY_AXIS_TRIGGER_RIGHT}
const _BUTTONS := {"a": JOY_BUTTON_A, "b": JOY_BUTTON_B, "x": JOY_BUTTON_X, "y": JOY_BUTTON_Y,
	"back": JOY_BUTTON_BACK, "start": JOY_BUTTON_START, "guide": JOY_BUTTON_GUIDE,
	"left_stick": JOY_BUTTON_LEFT_STICK, "right_stick": JOY_BUTTON_RIGHT_STICK,
	"left_shoulder": JOY_BUTTON_LEFT_SHOULDER, "right_shoulder": JOY_BUTTON_RIGHT_SHOULDER,
	"dpad_up": JOY_BUTTON_DPAD_UP, "dpad_down": JOY_BUTTON_DPAD_DOWN,
	"dpad_left": JOY_BUTTON_DPAD_LEFT, "dpad_right": JOY_BUTTON_DPAD_RIGHT}


## "key:W", "key:Ctrl+S", "key:Space", "mouse:left", "joy_button:a", "joy_axis:left_x:-1"
static func parse_input_event(spec: String) -> Variant:
	var kind := spec.get_slice(":", 0).to_lower()
	var rest := spec.substr(kind.length() + 1)
	match kind:
		"key":
			var ev := InputEventKey.new()
			var parts := rest.split("+")
			var key_name := parts[parts.size() - 1]
			var code := OS.find_keycode_from_string(key_name)
			if code == KEY_NONE:
				return Codec.fail("Unknown key '%s'" % key_name)
			ev.physical_keycode = code
			for m in parts.slice(0, parts.size() - 1):
				match m.to_lower():
					"ctrl": ev.ctrl_pressed = true
					"shift": ev.shift_pressed = true
					"alt": ev.alt_pressed = true
					"meta", "cmd": ev.meta_pressed = true
			return ev
		"mouse":
			if not _MOUSE.has(rest.to_lower()):
				return Codec.fail("mouse button must be one of %s" % ", ".join(_MOUSE.keys()))
			var mb := InputEventMouseButton.new()
			mb.button_index = _MOUSE[rest.to_lower()]
			return mb
		"joy_button":
			var jb := InputEventJoypadButton.new()
			jb.button_index = _BUTTONS.get(rest.to_lower(), int(rest) if rest.is_valid_int() else -1)
			if jb.button_index < 0:
				return Codec.fail("Unknown joypad button '%s'" % rest)
			return jb
		"joy_axis":
			var ja := InputEventJoypadMotion.new()
			var axis := rest.get_slice(":", 0)
			ja.axis = _AXES.get(axis.to_lower(), int(axis) if axis.is_valid_int() else -1)
			if ja.axis < 0:
				return Codec.fail("Unknown joypad axis '%s'" % axis)
			ja.axis_value = float(rest.get_slice(":", 1)) if rest.contains(":") else 1.0
			return ja
	return Codec.fail("Input spec '%s' not understood. Use key:W, mouse:left, joy_button:a, joy_axis:left_x:-1" % spec)


# ---------------------------------------------------------------- animation

const _INTERP := {"nearest": Animation.INTERPOLATION_NEAREST, "linear": Animation.INTERPOLATION_LINEAR,
	"cubic": Animation.INTERPOLATION_CUBIC, "linear_angle": Animation.INTERPOLATION_LINEAR_ANGLE,
	"cubic_angle": Animation.INTERPOLATION_CUBIC_ANGLE}
const _UPDATE := {"continuous": Animation.UPDATE_CONTINUOUS, "discrete": Animation.UPDATE_DISCRETE, "capture": Animation.UPDATE_CAPTURE}
const _TRACK := {"value": Animation.TYPE_VALUE, "position_3d": Animation.TYPE_POSITION_3D,
	"rotation_3d": Animation.TYPE_ROTATION_3D, "scale_3d": Animation.TYPE_SCALE_3D,
	"blend_shape": Animation.TYPE_BLEND_SHAPE, "method": Animation.TYPE_METHOD,
	"bezier": Animation.TYPE_BEZIER, "audio": Animation.TYPE_AUDIO, "animation": Animation.TYPE_ANIMATION}


## a: {length, loop: none|linear|pingpong|true, step, tracks: [{path, type, interp, update, keys: [...]}]}
static func build_animation(player: Node, a: Dictionary) -> Variant:
	var anim := Animation.new()
	anim.length = float(a.get("length", 1.0))
	anim.step = float(a.get("step", 1.0 / 30.0))
	var loop = a.get("loop", "none")
	if typeof(loop) == TYPE_BOOL:
		loop = "linear" if loop else "none"
	anim.loop_mode = {"none": Animation.LOOP_NONE, "linear": Animation.LOOP_LINEAR, "pingpong": Animation.LOOP_PINGPONG}.get(str(loop), Animation.LOOP_NONE)
	var base: Node = player.get_node_or_null(player.root_node)
	for t in a.get("tracks", []):
		var tpath := NodePath(str(t.get("path", "")))
		var ttype: int = _TRACK.get(str(t.get("type", "value")), -1)
		if ttype < 0:
			return Codec.fail("Unknown track type '%s'. Use: %s" % [t.get("type"), ", ".join(_TRACK.keys())])
		var idx := anim.add_track(ttype)
		anim.track_set_path(idx, tpath)
		var target: Node = base.get_node_or_null(NodePath(tpath.get_concatenated_names())) if base else null
		var subprop := str(tpath.get_concatenated_subnames())
		if target == null and ttype != Animation.TYPE_METHOD:
			push_warning("Animation track target not found yet: %s (relative to %s)" % [tpath, player.root_node])
		if t.has("interp"):
			anim.track_set_interpolation_type(idx, _INTERP.get(str(t.interp), Animation.INTERPOLATION_LINEAR))
		var discrete := false
		for k in t.get("keys", []):
			var time := float(k.get("time", 0.0))
			match ttype:
				Animation.TYPE_VALUE:
					var v = k.get("value")
					if target and not subprop.is_empty():
						v = Codec.convert_for(target, subprop, v)
					else:
						v = Codec.from_json(v)
					if Codec.is_fail(v):
						return Codec.fail("track %s: %s" % [tpath, v.__error])
					if typeof(v) in [TYPE_BOOL, TYPE_INT, TYPE_OBJECT, TYPE_STRING, TYPE_STRING_NAME]:
						discrete = true
					anim.track_insert_key(idx, time, v, float(k.get("transition", 1.0)))
				Animation.TYPE_POSITION_3D:
					anim.position_track_insert_key(idx, time, Codec.from_json(k.value, TYPE_VECTOR3))
				Animation.TYPE_SCALE_3D:
					anim.scale_track_insert_key(idx, time, Codec.from_json(k.value, TYPE_VECTOR3))
				Animation.TYPE_ROTATION_3D:
					var rv = k.value
					var q: Quaternion
					if typeof(rv) == TYPE_ARRAY and rv.size() == 3:
						q = Quaternion.from_euler(Vector3(deg_to_rad(rv[0]), deg_to_rad(rv[1]), deg_to_rad(rv[2])))
					else:
						q = Codec.from_json(rv, TYPE_QUATERNION)
					anim.rotation_track_insert_key(idx, time, q)
				Animation.TYPE_BLEND_SHAPE:
					anim.blend_shape_track_insert_key(idx, time, float(k.value))
				Animation.TYPE_METHOD:
					anim.track_insert_key(idx, time, {"method": str(k.method), "args": (k.get("args", []) as Array).map(func(x): return Codec.from_json(x))})
				Animation.TYPE_BEZIER:
					anim.bezier_track_insert_key(idx, time, float(k.value), Codec.from_json(k.get("in_handle", [-0.25, 0]), TYPE_VECTOR2), Codec.from_json(k.get("out_handle", [0.25, 0]), TYPE_VECTOR2))
				Animation.TYPE_AUDIO:
					anim.audio_track_insert_key(idx, time, load(str(k.stream)), float(k.get("start_offset", 0)), float(k.get("end_offset", 0)))
				Animation.TYPE_ANIMATION:
					anim.animation_track_insert_key(idx, time, StringName(str(k.animation)))
		if ttype == Animation.TYPE_VALUE:
			var upd = t.get("update", "discrete" if discrete else "continuous")
			anim.value_track_set_update_mode(idx, _UPDATE.get(str(upd), Animation.UPDATE_CONTINUOUS))
	return anim


static func describe_animations(player: Node) -> Dictionary:
	var out := {}
	for lib_name in player.get_animation_library_list():
		var lib: AnimationLibrary = player.get_animation_library(lib_name)
		for an in lib.get_animation_list():
			var anim := lib.get_animation(an)
			var tracks: Array = []
			for i in anim.get_track_count():
				tracks.append("%s (%s, %d keys)" % [anim.track_get_path(i), _TRACK.find_key(anim.track_get_type(i)), anim.track_get_key_count(i)])
			out[an if str(lib_name).is_empty() else "%s/%s" % [lib_name, an]] = {"length": anim.length, "loop": anim.loop_mode, "tracks": tracks}
	return out


# ---------------------------------------------------------------- 2D helpers

## a: {texture, frame_size: [w,h] | hframes+vframes, animations: {name: {frames: [i...] | row: r | range: [a,b], fps, loop}}}
static func sprite_frames_from_sheet(a: Dictionary) -> Variant:
	var tex = load(str(a.get("texture", "")))
	if not tex is Texture2D:
		return Codec.fail("texture must be a res:// image path")
	var size: Vector2i = tex.get_size()
	var fw: int
	var fh: int
	if a.has("frame_size"):
		var fs := vec2i(a.frame_size)
		fw = fs.x
		fh = fs.y
	else:
		fw = size.x / int(a.get("hframes", 1))
		fh = size.y / int(a.get("vframes", 1))
	var cols := size.x / fw
	var rows := size.y / fh
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	var anims: Dictionary = a.get("animations", {"default": {"range": [0, cols * rows - 1]}})
	for an in anims:
		var spec: Dictionary = anims[an]
		var idxs: Array = []
		if spec.has("frames"):
			idxs = spec.frames
		elif spec.has("row"):
			for c in cols:
				idxs.append(int(spec.row) * cols + c)
			if spec.has("count"):
				idxs = idxs.slice(0, int(spec.count))
		elif spec.has("range"):
			for i in range(int(spec.range[0]), int(spec.range[1]) + 1):
				idxs.append(i)
		frames.add_animation(an)
		frames.set_animation_speed(an, float(spec.get("fps", 8)))
		frames.set_animation_loop(an, bool(spec.get("loop", true)))
		for i in idxs:
			var at := AtlasTexture.new()
			at.atlas = tex
			at.region = Rect2((int(i) % cols) * fw, (int(i) / cols) * fh, fw, fh)
			frames.add_frame(an, at)
	return frames


## a: {texture, tile_size: [w,h], separation, margins, collision: "all" | [[x,y],...] | "none", skip_empty: true}
static func tileset_from_atlas(a: Dictionary) -> Variant:
	var tex = load(str(a.get("texture", "")))
	if not tex is Texture2D:
		return Codec.fail("texture must be a res:// image path")
	var ts_size := vec2i(a.get("tile_size", [16, 16]))
	var ts := TileSet.new()
	ts.tile_size = ts_size
	var src := TileSetAtlasSource.new()
	src.texture = tex
	src.texture_region_size = ts_size
	src.separation = vec2i(a.get("separation", [0, 0]))
	src.margins = vec2i(a.get("margins", [0, 0]))
	ts.add_source(src, 0)
	var collision = a.get("collision", "none")
	var want_physics: bool = collision is Array or str(collision) == "all"
	if want_physics:
		ts.add_physics_layer()
	var img: Image = tex.get_image()
	if img and img.is_compressed():
		img.decompress()
	var grid := src.get_atlas_grid_size()
	var created := 0
	var half := Vector2(ts_size) / 2.0
	for y in grid.y:
		for x in grid.x:
			var c := Vector2i(x, y)
			if a.get("skip_empty", true) and img:
				var r := Rect2i(src.margins + c * (ts_size + src.separation), ts_size)
				if img.get_region(r).is_invisible():
					continue
			src.create_tile(c)
			created += 1
			if want_physics and (str(collision) == "all" or _has_coord(collision, c)):
				var td := src.get_tile_data(c, 0)
				td.add_collision_polygon(0)
				td.set_collision_polygon_points(0, 0, PackedVector2Array([-half, Vector2(half.x, -half.y), half, Vector2(-half.x, half.y)]))
	return ts


static func _has_coord(list: Array, c: Vector2i) -> bool:
	for item in list:
		if int(item[0]) == c.x and int(item[1]) == c.y:
			return true
	return false


## a: {rows: ["###", "#.#"], legend: {"#": [ax, ay] | {source, atlas: [x,y], alt}}, origin: [x,y], clear,
##     cells: [[x, y, ax, ay, source?], ...]}
static func tilemap_paint(layer: Node, a: Dictionary) -> Variant:
	if not layer is TileMapLayer:
		return Codec.fail("path must point to a TileMapLayer")
	var tml := layer as TileMapLayer
	if a.get("clear", false):
		tml.clear()
	var origin := vec2i(a.get("origin", [0, 0]))
	var legend: Dictionary = a.get("legend", {})
	var painted := 0
	var rows: Array = a.get("rows", [])
	for y in rows.size():
		var row: String = rows[y]
		for x in row.length():
			var ch := row[x]
			if not legend.has(ch):
				continue
			var e = legend[ch]
			var pos := origin + Vector2i(x, y)
			if e == null:
				tml.erase_cell(pos)
				continue
			if typeof(e) == TYPE_ARRAY:
				tml.set_cell(pos, 0, vec2i(e), 0)
			else:
				tml.set_cell(pos, int(e.get("source", 0)), vec2i(e.get("atlas", [0, 0])), int(e.get("alt", 0)))
			painted += 1
	for c in a.get("cells", []):
		tml.set_cell(Vector2i(int(c[0]), int(c[1])) + origin, int(c[4]) if c.size() > 4 else 0, Vector2i(int(c[2]), int(c[3])), 0)
		painted += 1
	return {"painted": painted, "used_rect": Codec.to_json(tml.get_used_rect())}
