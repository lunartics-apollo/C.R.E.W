extends Node
## In-game half of the Agent Bridge (autoload "AgentRuntime").
## Only listens when the game runs from the editor or with the `--agent-bridge` argument,
## so exported release builds never open a port.
## Port: GODOT_AGENT_RUNTIME_PORT env var, default 6551.

const BridgeServer := preload("res://addons/agent_bridge/bridge_server.gd")
const LogCapture := preload("res://addons/agent_bridge/log_capture.gd")
const Codec := preload("res://addons/agent_bridge/codec.gd")
const Shared := preload("res://addons/agent_bridge/shared_commands.gd")

var _server: BridgeServer
var _logs: LogCapture
var _cmds := {}


func _enter_tree() -> void:
	if Engine.is_editor_hint() or not _should_enable():
		set_process(false)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	_logs = LogCapture.new()
	OS.add_logger(_logs)
	_server = BridgeServer.new()
	_server.logs = _logs
	_server.handler = _handle
	var env_port := OS.get_environment("GODOT_AGENT_RUNTIME_PORT")
	var port := int(env_port) if env_port.is_valid_int() else 6551
	if _server.start(port, 4) == OK:
		print("[AgentBridge] runtime bridge listening on 127.0.0.1:%d" % _server.port)
	else:
		push_warning("[AgentBridge] runtime bridge could not open a port near %d" % port)
	_cmds = {
		"ping": func(_a): return {"pong": true, "side": "runtime", "port": _server.port},
		"help": func(_a): return _cmds.keys(),
		"game.tree": _tree_cmd,
		"game.screenshot": _screenshot,
		"game.input": _input_cmd,
		"game.watch": _watch_cmd,
		"game.ui": _ui_cmd,
		"game.wait": _wait_cmd,
		"game.logs": func(a): return Shared.get_logs(_logs, a),
		"game.exec": _exec,
		"game.stats": _stats,
		"game.scene": _scene_cmd,
		"game.time": _time_cmd,
		"game.quit": _quit,
		"node.get": _node_get,
		"node.set": _node_set,
		"node.call": _node_call,
		"node.find": _node_find,
		"class.info": func(a): return Shared.class_info(str(a.get("name", ""))),
	}


func _should_enable() -> bool:
	var args := OS.get_cmdline_args() + OS.get_cmdline_user_args()
	if "--agent-bridge" in args:
		return true
	if "--no-agent-bridge" in args:
		return false
	# Launched from the editor's play buttons: the editor attaches its debugger and passes its pid.
	return OS.is_debug_build() and ("--editor-pid" in args or EngineDebugger.is_active())


func _exit_tree() -> void:
	if _server:
		_server.stop()
	if _logs:
		OS.remove_logger(_logs)


func _process(_delta: float) -> void:
	if _server:
		_server.poll()


func _handle(cmd: String, args: Dictionary) -> Variant:
	if not _cmds.has(cmd):
		return Codec.fail("Unknown runtime command '%s'. Use 'help'." % cmd)
	return await _cmds[cmd].call(args)


# ---------------------------------------------------------------- helpers

func _scene_root() -> Node:
	return get_tree().current_scene if get_tree().current_scene else get_tree().root


func _find(path) -> Node:
	var p := "." if path == null else str(path)
	if p.begins_with("/"):
		return get_tree().root.get_node_or_null(p)
	if p in ["", "."]:
		return _scene_root()
	return _scene_root().get_node_or_null(p)


func _need(path) -> Variant:
	var n := _find(path)
	return n if n else Codec.fail("Node not found: '%s' (paths are relative to the current scene, or absolute /root/...)" % str(path))


# ---------------------------------------------------------------- commands

func _tree_cmd(a: Dictionary) -> Variant:
	var start = _need(a.get("path", "."))
	if Codec.is_fail(start):
		return start
	var lines: PackedStringArray = ["current_scene: %s" % (get_tree().current_scene.scene_file_path if get_tree().current_scene else "<none>")]
	_lines(start, start, 0, int(a.get("depth", 6)), a.get("props", []), lines)
	return "\n".join(lines)


func _lines(base: Node, n: Node, level: int, depth: int, props: Array, lines: PackedStringArray) -> void:
	var s := "%s%s  [%s]" % ["  ".repeat(level), "." if n == base else str(base.get_path_to(n)), n.get_class()]
	if n is Node2D:
		s += " pos=%s" % JSON.stringify(Codec.to_json((n as Node2D).global_position))
	elif n is Node3D and n.is_inside_tree():
		s += " pos=%s" % JSON.stringify(Codec.to_json((n as Node3D).global_position))
	if n is CanvasItem and not (n as CanvasItem).visible:
		s += " hidden"
	for p in props:
		if p in n:
			s += " %s=%s" % [p, JSON.stringify(Codec.to_json(n.get(p)))]
	lines.append(s)
	if level >= depth:
		if n.get_child_count() > 0:
			lines.append("%s  ... %d children" % ["  ".repeat(level), n.get_child_count()])
		return
	for c in n.get_children():
		if c == self:
			continue
		_lines(base, c, level + 1, depth, props, lines)


func _screenshot(a: Dictionary) -> Variant:
	if DisplayServer.get_name() == "headless":
		return Codec.fail("Game runs headless: nothing is rendered.")
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	if img == null or img.is_empty():
		return Codec.fail("Viewport returned no image")
	# Resample to the game's own coordinate space (visible rect), so image pixels match the
	# positions game code sees in event.position and that game.input click/mouse_move expect.
	var vis := get_viewport().get_visible_rect().size
	if vis.x >= 1 and vis.y >= 1 and Vector2(img.get_size()) != vis:
		img.resize(int(vis.x), int(vis.y), Image.INTERPOLATE_BILINEAR)
	var r := Shared.image_result(img, "game", int(a.get("max_width", 1280)))
	r["coord_scale"] = snappedf(vis.x / float(r.width), 0.0001)
	r["viewport"] = [int(vis.x), int(vis.y)]
	return r


## events: [{action:"jump"} tap | {action, hold: s} | {action, pressed: bool} | {key:"W", ...same}
##          | {click: [x,y], button, warp} | {click_node: path, button} | {mouse_move: [x,y], warp} | {hover: path}
##          | {text: "abc"} | {wait: s} | {frames: n} | {until: expr, timeout}
##          | {assert: expr, label, show} | {observe: {name: expr}}]
## x,y are viewport coordinates (game screenshot pixels × coord_scale). Expressions are GDScript
## expressions with root, tree and node(path). A timed-out `until`, or a failing `assert` while
## stop_on_fail (default true), ends the sequence; the reply says which step and why.
func _input_cmd(a: Dictionary) -> Variant:
	var done := 0
	var asserts: Array = []
	var observed := {}
	var stop_on_fail := bool(a.get("stop_on_fail", true))
	var events: Array = a.get("events", [])
	for i in events.size():
		var e: Dictionary = events[i]
		if e.has("wait"):
			await get_tree().create_timer(float(e.wait), true, false, true).timeout
		elif e.has("frames"):
			for f in int(e.frames):
				await get_tree().physics_frame
		elif e.has("until"):
			var ok = await _wait_until(str(e.until), float(e.get("timeout", 10.0)))
			if Codec.is_fail(ok):
				return ok
			if not ok:
				return _seq_result(done, asserts, observed, {"step": i, "reason": "until timed out: %s" % e.until})
		elif e.has("assert"):
			var v = _eval(str(e.assert))
			if Codec.is_fail(v):
				return v
			var entry := {"label": str(e.get("label", e.assert)), "ok": bool(v)}
			if e.has("show"):
				entry["value"] = _compact(_eval(str(e.show)))
			asserts.append(entry)
			if not entry.ok and stop_on_fail:
				return _seq_result(done + 1, asserts, observed, {"step": i, "reason": "assert failed: %s" % entry.label})
		elif e.has("observe"):
			for k in e.observe:
				var v = _eval(str(e.observe[k]))
				if Codec.is_fail(v):
					return v
				observed[k] = _compact(v)
		elif e.has("click_node"):
			var at = _node_screen_pos(str(e.click_node))
			if Codec.is_fail(at):
				return at
			var ce := e.duplicate()
			ce["click"] = [at.x, at.y]
			await _click(ce)
		elif e.has("action") or e.has("key"):
			var ev_on = _make_event(e, true)
			if Codec.is_fail(ev_on):
				return ev_on
			if e.has("pressed"):
				Input.parse_input_event(_make_event(e, bool(e.pressed)))
			else:
				Input.parse_input_event(ev_on)
				if e.has("hold"):
					await get_tree().create_timer(float(e.hold), true, false, true).timeout
				else:
					await get_tree().physics_frame
					await get_tree().physics_frame
				Input.parse_input_event(_make_event(e, false))
		elif e.has("click"):
			await _click(e)
		elif e.has("mouse_move") or e.has("hover"):
			var target = _node_screen_pos(str(e.hover)) if e.has("hover") else Codec.from_json(e.mouse_move, TYPE_VECTOR2)
			if Codec.is_fail(target):
				return target
			_mouse_move(_to_window(target, bool(e.get("warp", false))))
		elif e.has("text"):
			for ch in str(e.text):
				for pressed in [true, false]:
					var k := InputEventKey.new()
					k.unicode = ch.unicode_at(0)
					k.keycode = OS.find_keycode_from_string(ch.to_upper()) if ch != " " else KEY_SPACE
					k.pressed = pressed
					Input.parse_input_event(k)
				await get_tree().process_frame
		else:
			return Codec.fail("Unknown input event: %s" % JSON.stringify(e))
		done += 1
	return _seq_result(done, asserts, observed, {})


func _seq_result(done: int, asserts: Array, observed: Dictionary, stopped: Dictionary) -> Dictionary:
	var r := {"events": done}
	if not asserts.is_empty():
		r["passed"] = stopped.is_empty() and asserts.all(func(x): return x.ok)
		r["asserts"] = asserts
	if not observed.is_empty():
		r["observed"] = observed
	if not stopped.is_empty():
		r["stopped"] = stopped
	return r


func _click(e: Dictionary) -> void:
	var pos := _to_window(Codec.from_json(e.click, TYPE_VECTOR2), bool(e.get("warp", false)))
	var btn: int = Shared._MOUSE.get(str(e.get("button", "left")), MOUSE_BUTTON_LEFT)
	_mouse_move(pos)
	for pressed in [true, false]:
		var mb := InputEventMouseButton.new()
		mb.button_index = btn
		mb.pressed = pressed
		mb.position = pos
		mb.global_position = pos
		Input.parse_input_event(mb)
		await get_tree().process_frame


## Viewport position of a node: Control centre, Node2D origin, or Node3D projected by the active
## camera. Fails with the reason a player couldn't click it (hidden, off-screen, behind the camera).
func _node_screen_pos(path: String) -> Variant:
	var n := _find(path)
	if n == null:
		return Codec.fail("Node not found: '%s'" % path)
	var p: Vector2
	if n is Control:
		var c := n as Control
		if not c.is_visible_in_tree():
			return Codec.fail("'%s' is not visible" % path)
		p = c.get_global_transform_with_canvas() * (c.size / 2.0)
	elif n is Node2D:
		if not (n as Node2D).is_visible_in_tree():
			return Codec.fail("'%s' is not visible" % path)
		p = (n as Node2D).get_global_transform_with_canvas().origin
	elif n is Node3D:
		var cam := get_viewport().get_camera_3d()
		if cam == null:
			return Codec.fail("No active Camera3D to project '%s'" % path)
		if cam.is_position_behind((n as Node3D).global_position):
			return Codec.fail("'%s' is behind the camera" % path)
		p = cam.unproject_position((n as Node3D).global_position)
	else:
		return Codec.fail("'%s' (%s) has no screen position" % [path, n.get_class()])
	if not get_viewport().get_visible_rect().has_point(p):
		return Codec.fail("'%s' is off-screen at %s" % [path, p])
	return p


## Evaluates a GDScript expression with root, tree and node(path) available.
func _eval(src: String) -> Variant:
	var expr := Expression.new()
	if expr.parse(src, ["root", "tree"]) != OK:
		return Codec.fail("Expression '%s': %s" % [src, expr.get_error_text()])
	var v = expr.execute([_scene_root(), get_tree()], self)
	if expr.has_execute_failed():
		return Codec.fail("Expression '%s' failed: %s" % [src, expr.get_error_text()])
	return v


func _wait_until(src: String, timeout: float) -> Variant:
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < timeout * 1000.0:
		var v = _eval(src)
		if Codec.is_fail(v):
			return v
		if v:
			return true
		await get_tree().process_frame
	return false


## Token-cheap values for traces: rounded numbers, vectors as arrays.
func _compact(v: Variant) -> Variant:
	match typeof(v):
		TYPE_FLOAT:
			return snappedf(v, 0.01)
		TYPE_VECTOR2, TYPE_VECTOR2I:
			return [snappedf(v.x, 0.01), snappedf(v.y, 0.01)]
		TYPE_VECTOR3, TYPE_VECTOR3I:
			return [snappedf(v.x, 0.01), snappedf(v.y, 0.01), snappedf(v.z, 0.01)]
		TYPE_ARRAY:
			return (v as Array).slice(0, 50).map(_compact)
		TYPE_OBJECT:
			return str(v)
	return Codec.to_json(v)


## Samples expressions every few physics frames, optionally while playing an input sequence:
## {track: {x: "node('Player').position.x"}, seconds: 2 | frames: 120, every: 6, events?: [...]}
## → {t: [...], x: [...], summary: {x: {min, max, last}}, input: <sequence result>}
func _watch_cmd(a: Dictionary) -> Variant:
	var track: Dictionary = a.get("track", {})
	if track.is_empty():
		return Codec.fail("track: {name: expression} is required")
	var total := int(a.get("frames", int(float(a.get("seconds", 2.0)) * Engine.physics_ticks_per_second)))
	var every := maxi(1, int(a.get("every", 6)))
	var cols := {"t": []}
	for k in track:
		cols[k] = []
	var state := {"result": null}
	if a.has("events"):
		var run := func(): state.result = await _input_cmd({"events": a.events, "stop_on_fail": a.get("stop_on_fail", true)})
		run.call()
	var t0 := Time.get_ticks_msec()
	for f in total + 1:
		if f % every == 0:
			cols.t.append(snappedf((Time.get_ticks_msec() - t0) / 1000.0, 0.01))
			for k in track:
				var v = _eval(str(track[k]))
				if Codec.is_fail(v):
					return v
				cols[k].append(_compact(v))
		if f < total:
			await get_tree().physics_frame
	var summary := {}
	for k in track:
		var nums: Array = cols[k].filter(func(x): return typeof(x) in [TYPE_FLOAT, TYPE_INT])
		if not nums.is_empty():
			summary[k] = {"min": nums.min(), "max": nums.max(), "last": nums.back()}
	cols["summary"] = summary
	if a.has("events"):
		cols["input"] = state.result if state.result != null else "still running"
	return cols


## Visible, on-screen interactive UI (buttons, inputs, sliders…) with viewport centres, so tests
## click by name instead of guessing pixels. {labels?: bool (also list text), root?: path}
func _ui_cmd(a: Dictionary) -> Variant:
	var start = _need(a.get("root", "/root"))
	if Codec.is_fail(start):
		return start
	var want_labels := bool(a.get("labels", false))
	var out: Array = []
	var vis := get_viewport().get_visible_rect()
	for n in (start as Node).find_children("*", "Control", true, false):
		var c := n as Control
		if not c.is_visible_in_tree():
			continue
		var interactive := c is BaseButton or c is LineEdit or c is TextEdit or c is Range or c is ItemList or c is TabBar
		if not interactive and not (want_labels and (c is Label or c is RichTextLabel)):
			continue
		var centre := c.get_global_transform_with_canvas() * (c.size / 2.0)
		if not vis.has_point(centre):
			continue
		var row := {"path": str(_scene_root().get_path_to(c)) if _scene_root().is_ancestor_of(c) else str(c.get_path()),
			"type": c.get_class(), "at": [roundi(centre.x), roundi(centre.y)]}
		var label := str(c.get("text")) if "text" in c else ""
		if label.is_empty() and c is BaseButton:
			# Card-style buttons draw their caption with child Labels.
			var parts := PackedStringArray()
			for l in c.find_children("*", "Label", true, false):
				if (l as Label).is_visible_in_tree() and not (l as Label).text.strip_edges().is_empty():
					parts.append((l as Label).text.strip_edges().replace("\n", " "))
			label = " | ".join(parts)
		if label.is_empty():
			label = c.tooltip_text
		if not label.is_empty():
			row["text"] = label.left(60)
		if c is BaseButton and (c as BaseButton).disabled:
			row["disabled"] = true
		if c is Range:
			row["value"] = (c as Range).value
		out.append(row)
		if out.size() >= 150:
			break
	if out.any(func(r): return "@" in r.path):
		return {"controls": out, "note": "paths with @ are auto-generated names that change between runs: set node.name in the game code for stable test paths"}
	return out


func _make_event(e: Dictionary, pressed: bool) -> Variant:
	if e.has("action"):
		if not InputMap.has_action(str(e.action)):
			return Codec.fail("No input action '%s'. Existing: %s" % [e.action, ", ".join(InputMap.get_actions().filter(func(x): return not str(x).begins_with("ui_")))])
		var ev := InputEventAction.new()
		ev.action = StringName(str(e.action))
		ev.pressed = pressed
		ev.strength = float(e.get("strength", 1.0)) if pressed else 0.0
		return ev
	var parsed = Shared.parse_input_event("key:" + str(e.key))
	if Codec.is_fail(parsed):
		return parsed
	var k: InputEventKey = parsed
	k.keycode = k.physical_keycode
	k.pressed = pressed
	return k


## Agent coordinates are in the game's viewport space (= game screenshot pixels × coord_scale).
## Input.parse_input_event expects window pixels, so apply the stretch/letterbox transform.
## warp also moves the OS cursor, for games that poll get_mouse_position() instead of events.
func _to_window(pos: Vector2, warp: bool) -> Vector2:
	var w := get_viewport().get_final_transform() * pos
	if warp:
		Input.warp_mouse(w)
	return w


func _mouse_move(pos: Vector2) -> void:
	var mm := InputEventMouseMotion.new()
	mm.position = pos
	mm.global_position = pos
	Input.parse_input_event(mm)


func _wait_cmd(a: Dictionary) -> Variant:
	if a.has("seconds"):
		await get_tree().create_timer(float(a.seconds), true, false, true).timeout
	else:
		for i in int(a.get("frames", 1)):
			await get_tree().process_frame
	if a.has("until"):
		# GDScript expression polled each frame, e.g. "node('Player').is_on_floor()"
		var t0 := Time.get_ticks_msec()
		var ok = await _wait_until(str(a.until), float(a.get("timeout", 10.0)))
		if Codec.is_fail(ok):
			return ok
		if ok:
			return {"until": true, "seconds": (Time.get_ticks_msec() - t0) / 1000.0}
		return {"until": false, "timed_out": true}
	return {"frame": Engine.get_process_frames()}


## Lets `wait until` expressions call node("Player").
func node(path: String) -> Node:
	return _find(path)


func _exec(a: Dictionary) -> Variant:
	return await Shared.exec_gdscript(str(a.get("code", "")), {"root": _scene_root(), "tree": get_tree()}, _logs, "res://addons/agent_bridge/exec_context_runtime.gd")


func _stats(_a: Dictionary) -> Dictionary:
	return {
		"fps": Engine.get_frames_per_second(),
		"frame": Engine.get_process_frames(),
		"time_scale": Engine.time_scale,
		"paused": get_tree().paused,
		"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"orphan_nodes": Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT),
		"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"static_memory_mb": snappedf(Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, 0.1),
		"window_size": Codec.to_json(get_viewport().get_visible_rect().size),
		"current_scene": get_tree().current_scene.scene_file_path if get_tree().current_scene else null,
	}


func _scene_cmd(a: Dictionary) -> Variant:
	if a.get("reload", false):
		get_tree().reload_current_scene()
	elif a.has("change"):
		var err := get_tree().change_scene_to_file(str(a.change))
		if err != OK:
			return Codec.fail(error_string(err))
	await get_tree().process_frame
	await get_tree().process_frame
	return get_tree().current_scene.scene_file_path if get_tree().current_scene else null


func _time_cmd(a: Dictionary) -> Variant:
	if a.has("scale"):
		Engine.time_scale = float(a.scale)
	if a.has("paused"):
		get_tree().paused = bool(a.paused)
	return {"time_scale": Engine.time_scale, "paused": get_tree().paused}


func _quit(_a: Dictionary) -> Variant:
	get_tree().create_timer(0.1, true, false, true).timeout.connect(get_tree().quit)
	return "quitting"


func _node_get(a: Dictionary) -> Variant:
	var n = _need(a.get("path", "."))
	if Codec.is_fail(n):
		return n
	if a.has("props"):
		var vals := {}
		for p in a.props:
			vals[p] = Codec.to_json(n.get_indexed(NodePath(p)))
		return {"path": str(n.get_path()), "type": n.get_class(), "props": vals}
	return {"path": str(n.get_path()), "type": n.get_class(), "props": Codec.changed_props(n, a.get("all", false))}


func _node_set(a: Dictionary) -> Variant:
	var n = _need(a.get("path", "."))
	if Codec.is_fail(n):
		return n
	for k in a.get("props", {}):
		var r = Codec.set_prop(n, k, a.props[k])
		if Codec.is_fail(r):
			return r
	return true


func _node_call(a: Dictionary) -> Variant:
	var n = _need(a.get("path", "."))
	if Codec.is_fail(n):
		return n
	var method := str(a.get("method", ""))
	if not n.has_method(method):
		return Codec.fail("%s has no method '%s'" % [n.get_class(), method])
	return await n.callv(method, (a.get("args", []) as Array).map(func(x): return Codec.from_json(x)))


func _node_find(a: Dictionary) -> Variant:
	var start = _need(a.get("root", "."))
	if Codec.is_fail(start):
		return start
	var out: Array = []
	var group := str(a.get("group", ""))
	var nodes: Array = get_tree().get_nodes_in_group(group) if not group.is_empty() else start.find_children(str(a.get("name", "*")), str(a.get("type", "")), true, false)
	for n in nodes.slice(0, 300):
		out.append("%s  [%s]" % [n.get_path(), n.get_class()])
	return out
