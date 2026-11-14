@tool
extends RefCounted
## Command handlers for the editor side of the bridge.
## Node paths are relative to the edited scene root ("." = root).

const Codec := preload("res://addons/agent_bridge/codec.gd")
const Shared := preload("res://addons/agent_bridge/shared_commands.gd")
const VERSION := "0.1.0"

var plugin: EditorPlugin
var logs: Object
var _cmds := {}


func _init(p: EditorPlugin, log_capture: Object) -> void:
	plugin = p
	logs = log_capture
	_cmds = {
		"ping": func(_a): return {"pong": true, "side": "editor", "version": VERSION},
		"help": func(_a): return _cmds.keys(),
		"editor.state": _editor_state,
		"editor.select": _editor_select,
		"editor.screenshot": _editor_screenshot,
		"editor.logs": func(a): return Shared.get_logs(logs, a),
		"editor.exec": _editor_exec,
		"scene.new": _scene_new,
		"scene.open": _scene_open,
		"scene.save": _scene_save,
		"scene.close": func(_a): return EditorInterface.close_scene() == OK,
		"scene.reload": _scene_reload,
		"scene.tree": _scene_tree,
		"node.add": _node_add,
		"node.remove": _node_remove,
		"node.set": _node_set,
		"node.get": _node_get,
		"node.rename": _node_rename,
		"node.move": _node_move,
		"node.duplicate": _node_duplicate,
		"node.connect": _node_connect,
		"node.call": _node_call,
		"node.find": _node_find,
		"node.groups": _node_groups,
		"script.attach": _script_attach,
		"script.validate": _script_validate,
		"resource.create": _resource_create,
		"resource.get": _resource_get,
		"resource.set": _resource_set,
		"animation.create": _animation_create,
		"animation.list": _animation_list,
		"sprite_frames.from_sheet": _sprite_frames_from_sheet,
		"tileset.from_atlas": _tileset_from_atlas,
		"tilemap.paint": _tilemap_paint,
		"project.get": _project_get,
		"project.set": _project_set,
		"project.input_add": _project_input_add,
		"project.autoload": _project_autoload,
		"fs.scan": _fs_scan,
		"fs.reimport": _fs_reimport,
		"class.info": func(a): return Shared.class_info(str(a.get("name", ""))),
		"class.search": func(a): return Shared.class_search(str(a.get("query", "")), str(a.get("base", ""))),
		"run.play": _run_play,
		"run.stop": func(_a): EditorInterface.stop_playing_scene(); return true,
		"run.status": func(_a): return {"playing": EditorInterface.is_playing_scene(), "scene": EditorInterface.get_playing_scene()},
	}


func handle(cmd: String, args: Dictionary) -> Variant:
	if not _cmds.has(cmd):
		return Codec.fail("Unknown editor command '%s'. Use 'help' to list commands." % cmd)
	return await _cmds[cmd].call(args)


# ================================================================ helpers

func _tree() -> SceneTree:
	return plugin.get_tree()


func _root() -> Node:
	return EditorInterface.get_edited_scene_root()


func _rel(n: Node) -> String:
	var root := _root()
	if n == root:
		return "."
	return str(root.get_path_to(n))


func _find(path) -> Node:
	var root := _root()
	if root == null:
		return null
	var p := "." if path == null else str(path)
	if p in ["", ".", "/", root.name]:
		return root
	if p.begins_with("./"):
		p = p.substr(2)
	if p.begins_with(root.name + "/"):
		p = p.substr(root.name.length() + 1)
	return root.get_node_or_null(p)


## Returns the node or a Codec.fail dictionary.
func _need(path) -> Variant:
	if _root() == null:
		return Codec.fail("No scene is open in the editor. Use scene.open or scene.new first.")
	var n := _find(path)
	if n == null:
		return Codec.fail("Node not found: '%s'. Use scene.tree to see valid paths." % str(path))
	return n


## Sets owner on `n` and its descendants, without entering instanced sub-scenes.
func _own(n: Node, owner: Node, undo: EditorUndoRedoManager = null) -> void:
	if n != owner:
		if undo:
			undo.add_do_method(n, "set_owner", owner)
		else:
			n.owner = owner
	if n != owner and not n.scene_file_path.is_empty():
		return
	for c in n.get_children():
		_own(c, owner, undo)


func _wait_frames(n: int) -> void:
	for i in n:
		await _tree().process_frame


func _save_res(res: Resource, path: String) -> Variant:
	if not path.begins_with("res://"):
		return Codec.fail("Save path must start with res://")
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var err := ResourceSaver.save(res, path)
	if err != OK:
		return Codec.fail("Could not save %s: %s" % [path, error_string(err)])
	res.take_over_path(path)
	EditorInterface.get_resource_filesystem().update_file(path)
	return path


# ================================================================ editor

func _editor_state(_a: Dictionary) -> Dictionary:
	var root := _root()
	var sel: Array = []
	for n in EditorInterface.get_selection().get_selected_nodes():
		if root and (n == root or root.is_ancestor_of(n)):
			sel.append(_rel(n))
	var v := Engine.get_version_info()
	return {
		"bridge_version": VERSION,
		"godot_version": "%d.%d.%d.%s" % [v.major, v.minor, v.patch, v.status],
		"project_name": ProjectSettings.get_setting("application/config/name", ""),
		"project_path": ProjectSettings.globalize_path("res://"),
		"main_scene": ProjectSettings.get_setting("application/run/main_scene", ""),
		"renderer": ProjectSettings.get_setting("rendering/renderer/rendering_method", ""),
		"edited_scene": root.scene_file_path if root else null,
		"edited_root": ("%s (%s)" % [root.name, root.get_class()]) if root else null,
		"open_scenes": EditorInterface.get_open_scenes(),
		"unsaved_scenes": EditorInterface.get_unsaved_scenes(),
		"selection": sel,
		"playing": EditorInterface.is_playing_scene(),
		"playing_scene": EditorInterface.get_playing_scene(),
		"headless": DisplayServer.get_name() == "headless",
	}


func _editor_select(a: Dictionary) -> Variant:
	var selection := EditorInterface.get_selection()
	selection.clear()
	var picked: Array = []
	for p in a.get("paths", []):
		var n := _find(p)
		if n:
			selection.add_node(n)
			picked.append(_rel(n))
	if picked.size() == 1:
		EditorInterface.edit_node(_find(picked[0]))
	return picked


func _editor_screenshot(a: Dictionary) -> Variant:
	if DisplayServer.get_name() == "headless":
		return Codec.fail("Editor runs headless: nothing is rendered. Run the game with the runtime bridge, or open the editor with a window.")
	var view := str(a.get("view", "auto"))
	var root := _root()
	if view == "auto":
		view = "3d" if root is Node3D else "2d"
	var img: Image
	if a.has("camera"):
		var cam := _find(a.camera)
		if not (cam is Camera3D or cam is Camera2D):
			return Codec.fail("camera must be a Camera3D or Camera2D node path")
		img = await _render_from_camera(cam, Shared.vec2i(a.get("size", [1280, 720])))
	else:
		var vp: Viewport
		match view:
			"2d":
				EditorInterface.set_main_screen_editor("2D")
				vp = EditorInterface.get_editor_viewport_2d()
			"3d":
				EditorInterface.set_main_screen_editor("3D")
				vp = EditorInterface.get_editor_viewport_3d(int(a.get("index", 0)))
			"editor": vp = EditorInterface.get_base_control().get_viewport()
			_: return Codec.fail("view must be auto, 2d, 3d or editor")
		# The viewport only has a real size once its main screen is visible and laid out.
		await _drawn_frames(3)
		img = vp.get_texture().get_image()
		if img and img.get_width() < 16:
			return Codec.fail("The %s editor viewport is not visible (size %s). Is the editor window minimized?" % [view, img.get_size()])
	if img == null or img.is_empty():
		return Codec.fail("Viewport returned no image")
	return Shared.image_result(img, "editor_%s" % view, int(a.get("max_width", 1280)))


## The editor runs in low-processor mode and only draws when something changes, so waiting for
## frame_post_draw on an idle editor can hang. Force continuous drawing while we wait.
func _drawn_frames(n: int) -> void:
	var low := OS.low_processor_usage_mode
	OS.low_processor_usage_mode = false
	for i in n:
		EditorInterface.get_base_control().queue_redraw()
		await RenderingServer.frame_post_draw
	OS.low_processor_usage_mode = low


func _render_from_camera(cam: Node, size: Vector2i) -> Image:
	var vp := SubViewport.new()
	vp.size = size
	vp.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	vp.transparent_bg = false
	var clone: Node
	if cam is Camera3D:
		vp.world_3d = (cam as Camera3D).get_world_3d()
		var c3 := Camera3D.new()
		for p in ["fov", "size", "projection", "near", "far", "environment", "attributes", "h_offset", "v_offset", "keep_aspect", "cull_mask"]:
			c3.set(p, cam.get(p))
		vp.add_child(c3)
		c3.global_transform = (cam as Camera3D).global_transform
		c3.current = true
		clone = c3
	else:
		vp.world_2d = (cam as Camera2D).get_world_2d()
		var c2 := Camera2D.new()
		vp.add_child(c2)
		for p in ["offset", "anchor_mode", "ignore_rotation", "limit_enabled", "limit_left", "limit_top", "limit_right", "limit_bottom"]:
			if p in cam:
				c2.set(p, cam.get(p))
		c2.global_position = (cam as Camera2D).global_position
		c2.zoom = (cam as Camera2D).zoom
		c2.enabled = true
		c2.make_current()
		clone = c2
	EditorInterface.get_base_control().add_child(vp)
	await _drawn_frames(3)
	var img := vp.get_texture().get_image()
	vp.queue_free()
	return img


func _editor_exec(a: Dictionary) -> Variant:
	var ctx := {"root": _root(), "plugin": plugin, "editor": EditorInterface}
	return await Shared.exec_gdscript(str(a.get("code", "")), ctx, logs, "res://addons/agent_bridge/exec_context_editor.gd")


# ================================================================ scenes

func _scene_new(a: Dictionary) -> Variant:
	var path := str(a.get("path", ""))
	if not path.begins_with("res://") or not path.ends_with(".tscn"):
		return Codec.fail("path must be res://....tscn")
	if FileAccess.file_exists(path) and not a.get("overwrite", false):
		return Codec.fail("%s already exists (pass overwrite: true to replace)" % path)
	var root_type := str(a.get("root_type", "Node2D"))
	var root = Codec.instantiate_class(root_type)
	if not root is Node:
		return Codec.fail("root_type '%s' is not a Node class" % root_type)
	root.name = str(a.get("root_name", path.get_file().get_basename().to_pascal_case()))
	if a.has("script"):
		root.set_script(load(a.script))
	for k in a.get("props", {}):
		var r = Codec.set_prop(root, k, a.props[k])
		if Codec.is_fail(r):
			root.free()
			return r
	var ps := PackedScene.new()
	ps.pack(root)
	root.free()
	var saved = _save_res(ps, path)
	if Codec.is_fail(saved):
		return saved
	if a.get("open", true):
		EditorInterface.open_scene_from_path(path)
		await _wait_frames(2)
	if a.get("set_main", false):
		ProjectSettings.set_setting("application/run/main_scene", path)
		ProjectSettings.save()
	return {"path": path, "root": "%s (%s)" % [root_type, path.get_file()]}


func _scene_open(a: Dictionary) -> Variant:
	var path := str(a.get("path", ""))
	if not ResourceLoader.exists(path):
		return Codec.fail("Scene not found: %s" % path)
	EditorInterface.open_scene_from_path(path)
	await _wait_frames(2)
	var root := _root()
	return {"path": path, "root": "%s (%s)" % [root.name, root.get_class()] if root else null}


func _scene_save(a: Dictionary) -> Variant:
	if _root() == null:
		return Codec.fail("No scene open")
	if a.has("path"):
		EditorInterface.save_scene_as(str(a.path))
		return a.path
	if a.get("all", false):
		EditorInterface.save_all_scenes()
		return true
	if _root().scene_file_path.is_empty():
		return Codec.fail("Scene was never saved; pass path")
	var err := EditorInterface.save_scene()
	return _root().scene_file_path if err == OK else Codec.fail("save failed: %s" % error_string(err))


func _scene_reload(a: Dictionary) -> Variant:
	var path := str(a.get("path", _root().scene_file_path if _root() else ""))
	EditorInterface.reload_scene_from_path(path)
	await _wait_frames(2)
	return path


func _scene_tree(a: Dictionary) -> Variant:
	var start = _need(a.get("path", "."))
	if Codec.is_fail(start):
		return start
	var depth := int(a.get("depth", 12))
	var props: Array = a.get("props", [])
	var lines: PackedStringArray = []
	var header := "scene: %s" % (_root().scene_file_path if not _root().scene_file_path.is_empty() else "<unsaved>")
	lines.append(header)
	_tree_lines(start, 0, depth, props, lines)
	return "\n".join(lines)


func _tree_lines(n: Node, level: int, depth: int, props: Array, lines: PackedStringArray) -> void:
	var s := "%s%s  [%s]" % ["  ".repeat(level), _rel(n), n.get_class()]
	var scr := n.get_script() as Script
	if scr:
		s += " script=%s" % (scr.resource_path if not scr.resource_path.is_empty() else "<built-in>")
	if n != _root() and not n.scene_file_path.is_empty():
		s += " scene=%s" % n.scene_file_path
	var groups := n.get_groups().filter(func(g): return not str(g).begins_with("_"))
	if not groups.is_empty():
		s += " groups=%s" % ",".join(groups)
	for p in props:
		if p in n:
			s += " %s=%s" % [p, JSON.stringify(Codec.to_json(n.get(p)))]
	lines.append(s)
	if level >= depth:
		if n.get_child_count() > 0:
			lines.append("%s  ... %d children" % ["  ".repeat(level), n.get_child_count()])
		return
	# Children of instanced scenes are only listed if editable.
	if n != _root() and not n.scene_file_path.is_empty() and not _root().is_editable_instance(n):
		return
	for c in n.get_children():
		if c.owner == null and c != _root():
			continue  # internal/editor-only nodes
		_tree_lines(c, level + 1, depth, props, lines)


# ================================================================ nodes

## Builds a node (and children) from a spec without adding it to the tree.
func _build(spec: Dictionary) -> Variant:
	var node: Node
	if spec.has("scene"):
		var ps = load(str(spec.scene))
		if not ps is PackedScene:
			return Codec.fail("Not a scene: %s" % spec.scene)
		node = ps.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
	else:
		var t := str(spec.get("type", ""))
		if t.is_empty():
			return Codec.fail("node spec needs 'type' or 'scene'")
		var o = Codec.instantiate_class(t)
		if not o is Node:
			if o is Object and not o is RefCounted:
				o.free()
			return Codec.fail("'%s' is not an instantiable Node class" % t)
		node = o
	if spec.has("name"):
		node.name = str(spec.name)
	if spec.has("script"):
		var scr = load(str(spec.script))
		if not scr is Script:
			node.free()
			return Codec.fail("Not a script: %s" % spec.script)
		node.set_script(scr)
	var props: Dictionary = spec.get("props", {})
	for k in props:
		var r = Codec.set_prop(node, k, props[k])
		if Codec.is_fail(r):
			node.free()
			return Codec.fail("%s.%s: %s" % [spec.get("name", spec.get("type", "node")), k, r.__error])
	for g in spec.get("groups", []):
		node.add_to_group(str(g), true)
	for child_spec in spec.get("children", []):
		var child = _build(child_spec)
		if Codec.is_fail(child):
			node.free()
			return child
		node.add_child(child, true)
	return node


func _node_add(a: Dictionary) -> Variant:
	var parent = _need(a.get("parent", "."))
	if Codec.is_fail(parent):
		return parent
	var node = _build(a)
	if Codec.is_fail(node):
		return node
	var root := _root()
	var ur := plugin.get_undo_redo()
	ur.create_action("Agent: add %s" % node.name, UndoRedo.MERGE_DISABLE, root)
	ur.add_do_method(parent, "add_child", node, true)
	_own(node, root, ur)
	ur.add_do_method(node, "set_owner", root)
	if a.has("index"):
		ur.add_do_method(parent, "move_child", node, int(a.index))
	ur.add_do_reference(node)
	ur.add_undo_method(parent, "remove_child", node)
	ur.commit_action()
	return {"path": _rel(node), "type": node.get_class()}


func _node_remove(a: Dictionary) -> Variant:
	var paths: Array = a.get("paths", [a.get("path")])
	var removed: Array = []
	var ur := plugin.get_undo_redo()
	ur.create_action("Agent: remove nodes", UndoRedo.MERGE_DISABLE, _root())
	for p in paths:
		var n = _need(p)
		if Codec.is_fail(n):
			return n
		if n == _root():
			return Codec.fail("Cannot remove the scene root")
		var parent: Node = n.get_parent()
		ur.add_do_method(parent, "remove_child", n)
		ur.add_undo_method(parent, "add_child", n, true)
		ur.add_undo_method(parent, "move_child", n, n.get_index())
		_restore_owners(n, ur)
		ur.add_undo_reference(n)
		removed.append(_rel(n))
	ur.commit_action()
	return removed


func _restore_owners(n: Node, ur: EditorUndoRedoManager) -> void:
	if n.owner:
		ur.add_undo_method(n, "set_owner", n.owner)
	for c in n.get_children():
		_restore_owners(c, ur)


func _node_set(a: Dictionary) -> Variant:
	var n = _need(a.get("path", "."))
	if Codec.is_fail(n):
		return n
	var props: Dictionary = a.get("props", {})
	var ur := plugin.get_undo_redo()
	ur.create_action("Agent: set properties on %s" % n.name, UndoRedo.MERGE_DISABLE, _root())
	if props.has("script"):
		var scr = Codec.convert_for(n, "script", props.script)
		if Codec.is_fail(scr):
			return scr
		ur.add_do_method(n, "set_script", scr)
		ur.add_undo_method(n, "set_script", n.get_script())
		n.set_script(scr)  # apply now so exported properties exist for conversion below
	for k in props:
		if k == "script":
			continue
		if not ":" in k and Codec.prop_info(n, k).is_empty():
			return Codec.fail("%s has no property '%s'" % [n.get_class(), k])
		var v = Codec.convert_for(n, k, props[k])
		if Codec.is_fail(v):
			return Codec.fail("%s: %s" % [k, v.__error])
		ur.add_do_method(n, "set_indexed", NodePath(k), v)
		ur.add_undo_method(n, "set_indexed", NodePath(k), n.get_indexed(NodePath(k)))
	ur.commit_action()
	var out := {}
	for k in props:
		out[k] = Codec.to_json(n.get_indexed(NodePath(k)))
	return out


func _node_get(a: Dictionary) -> Variant:
	var n = _need(a.get("path", "."))
	if Codec.is_fail(n):
		return n
	var res := {"path": _rel(n), "type": n.get_class()}
	if a.has("props"):
		var vals := {}
		for p in a.props:
			vals[p] = Codec.to_json(n.get_indexed(NodePath(p)))
		res.props = vals
	else:
		res.props = Codec.changed_props(n, a.get("all", false))
	if a.get("signals", false):
		var conns: Array = []
		for s in n.get_signal_list():
			for c in n.get_signal_connection_list(s.name):
				if c.flags & Object.CONNECT_PERSIST:
					conns.append("%s -> %s.%s" % [s.name, _rel(c.callable.get_object()) if c.callable.get_object() is Node else "?", c.callable.get_method()])
		res.connections = conns
	return res


func _node_rename(a: Dictionary) -> Variant:
	var n = _need(a.get("path"))
	if Codec.is_fail(n):
		return n
	var ur := plugin.get_undo_redo()
	ur.create_action("Agent: rename", UndoRedo.MERGE_DISABLE, _root())
	ur.add_do_method(n, "set_name", str(a.name))
	ur.add_undo_method(n, "set_name", n.name)
	ur.commit_action()
	return _rel(n)


func _node_move(a: Dictionary) -> Variant:
	var n = _need(a.get("path"))
	if Codec.is_fail(n):
		return n
	var new_parent = _need(a.get("parent", "."))
	if Codec.is_fail(new_parent):
		return new_parent
	if n == new_parent or n.is_ancestor_of(new_parent):
		return Codec.fail("Cannot move a node under itself")
	var old_parent: Node = n.get_parent()
	var old_index: int = n.get_index()
	var keep := bool(a.get("keep_global_transform", true))
	var ur := plugin.get_undo_redo()
	ur.create_action("Agent: move node", UndoRedo.MERGE_DISABLE, _root())
	ur.add_do_method(n, "reparent", new_parent, keep)
	_own(n, _root(), ur)
	ur.add_do_method(n, "set_owner", _root())
	if a.has("index"):
		ur.add_do_method(new_parent, "move_child", n, int(a.index))
	ur.add_undo_method(n, "reparent", old_parent, keep)
	ur.add_undo_method(old_parent, "move_child", n, old_index)
	_restore_owners(n, ur)
	ur.commit_action()
	return _rel(n)


func _node_duplicate(a: Dictionary) -> Variant:
	var n = _need(a.get("path"))
	if Codec.is_fail(n):
		return n
	if n == _root():
		return Codec.fail("Cannot duplicate the root")
	var dup: Node = n.duplicate()
	if a.has("name"):
		dup.name = str(a.name)
	var parent: Node = _find(a.get("parent")) if a.has("parent") else n.get_parent()
	var ur := plugin.get_undo_redo()
	ur.create_action("Agent: duplicate", UndoRedo.MERGE_DISABLE, _root())
	ur.add_do_method(parent, "add_child", dup, true)
	_own(dup, _root(), ur)
	ur.add_do_method(dup, "set_owner", _root())
	ur.add_do_reference(dup)
	ur.add_undo_method(parent, "remove_child", dup)
	ur.commit_action()
	for k in a.get("props", {}):
		Codec.set_prop(dup, k, a.props[k])
	return _rel(dup)


func _node_connect(a: Dictionary) -> Variant:
	var from = _need(a.get("from", "."))
	if Codec.is_fail(from):
		return from
	var to = _need(a.get("to", "."))
	if Codec.is_fail(to):
		return to
	var sig := str(a.get("signal", ""))
	var method := str(a.get("method", ""))
	if not from.has_signal(sig):
		return Codec.fail("%s has no signal '%s'" % [from.get_class(), sig])
	var cb := Callable(to, method)
	var binds: Array = a.get("binds", [])
	if not binds.is_empty():
		cb = cb.bindv(binds)
	if a.get("disconnect", false):
		if from.is_connected(sig, cb):
			from.disconnect(sig, cb)
		return true
	if from.is_connected(sig, cb):
		return "already connected"
	var err: int = from.connect(sig, cb, Object.CONNECT_PERSIST | int(a.get("flags", 0)))
	if err != OK:
		return Codec.fail(error_string(err))
	EditorInterface.mark_scene_as_unsaved()
	var note := ""
	if not to.has_method(method):
		note = " (warning: %s has no method '%s' yet; add it to its script)" % [_rel(to), method]
	else:
		var sig_args := 0
		for s in from.get_signal_list():
			if s.name == sig:
				sig_args = s.args.size()
		var want: int = to.get_method_argument_count(method)
		if want != sig_args + binds.size():
			note = " (warning: signal passes %d argument(s) but %s() takes %d; fix the method signature)" % [sig_args + binds.size(), method, want]
	return "connected %s.%s -> %s.%s%s" % [_rel(from), sig, _rel(to), method, note]


func _node_call(a: Dictionary) -> Variant:
	var n = _need(a.get("path", "."))
	if Codec.is_fail(n):
		return n
	var method := str(a.get("method", ""))
	if not n.has_method(method):
		return Codec.fail("%s has no method '%s'" % [n.get_class(), method])
	var args: Array = (a.get("args", []) as Array).map(func(x): return Codec.from_json(x))
	var r = await n.callv(method, args)
	EditorInterface.mark_scene_as_unsaved()
	return r


func _node_find(a: Dictionary) -> Variant:
	var start = _need(a.get("root", "."))
	if Codec.is_fail(start):
		return start
	var out: Array = []
	var type := str(a.get("type", ""))
	var pattern := str(a.get("name", "*"))
	var group := str(a.get("group", ""))
	for n in [start] + start.find_children(pattern, type, true, true):
		if n == start and not (n.name.match(pattern) and (type.is_empty() or n.is_class(type))):
			continue
		if not group.is_empty() and not n.is_in_group(group):
			continue
		out.append("%s  [%s]" % [_rel(n), n.get_class()])
	return out


func _node_groups(a: Dictionary) -> Variant:
	var n = _need(a.get("path"))
	if Codec.is_fail(n):
		return n
	for g in a.get("add", []):
		n.add_to_group(str(g), true)
	for g in a.get("remove", []):
		n.remove_from_group(str(g))
	EditorInterface.mark_scene_as_unsaved()
	return n.get_groups().filter(func(g): return not str(g).begins_with("_"))


# ================================================================ scripts

func _script_attach(a: Dictionary) -> Variant:
	var n = _need(a.get("path", "."))
	if Codec.is_fail(n):
		return n
	var spath := str(a.get("script", ""))
	if a.has("source"):
		var f := FileAccess.open(spath, FileAccess.WRITE)
		if f == null:
			return Codec.fail("Cannot write %s" % spath)
		f.store_string(str(a.source))
		f.close()
		EditorInterface.get_resource_filesystem().update_file(spath)
	var scr = ResourceLoader.load(spath, "Script", ResourceLoader.CACHE_MODE_REPLACE)
	if not scr is Script:
		return Codec.fail("Could not load script %s (check script.validate)" % spath)
	var ur := plugin.get_undo_redo()
	ur.create_action("Agent: attach script", UndoRedo.MERGE_DISABLE, _root())
	ur.add_do_method(n, "set_script", scr)
	ur.add_undo_method(n, "set_script", n.get_script())
	ur.commit_action()
	return {"node": _rel(n), "script": spath}


func _script_validate(a: Dictionary) -> Variant:
	var paths: Array = []
	if a.has("path"):
		paths.append(str(a.path))
	for p in a.get("paths", []):
		paths.append(str(p))
	var results := {}
	for p in paths:
		results[p] = Shared.validate_script_file(p, logs)
	if a.has("source"):
		results["<source>"] = Shared.validate_script_source(str(a.source), logs)
	var all_ok := true
	for k in results:
		all_ok = all_ok and results[k].ok
	return {"ok": all_ok, "results": results, "__logs_handled": true}


# ================================================================ resources

func _resource_create(a: Dictionary) -> Variant:
	var res = Codec.from_json({"_type": a.get("type", "")}.merged(a.get("props", {})), TYPE_OBJECT, "Resource")
	if Codec.is_fail(res):
		return res
	if not res is Resource:
		return Codec.fail("%s is not a Resource" % a.get("type"))
	if a.has("path"):
		return _save_res(res, str(a.path))
	return Codec.fail("path is required")


func _resource_get(a: Dictionary) -> Variant:
	var path := str(a.get("path", ""))
	if not ResourceLoader.exists(path):
		return Codec.fail("Not found: %s" % path)
	var res := load(path)
	return {"path": path, "class": res.get_class(), "props": Codec.changed_props(res, a.get("all", false))}


func _resource_set(a: Dictionary) -> Variant:
	var path := str(a.get("path", ""))
	if not ResourceLoader.exists(path):
		return Codec.fail("Not found: %s" % path)
	var res := load(path)
	for k in a.get("props", {}):
		var r = Codec.set_prop(res, k, a.props[k])
		if Codec.is_fail(r):
			return r
	return _save_res(res, path)


# ================================================================ animation

func _animation_create(a: Dictionary) -> Variant:
	var player = _need(a.get("player"))
	if Codec.is_fail(player):
		return player
	if not player is AnimationMixer:
		return Codec.fail("player must be an AnimationPlayer")
	var name := str(a.get("name", "new_animation"))
	var lib_name := str(a.get("library", ""))
	var anim = Shared.build_animation(player, a)
	if Codec.is_fail(anim):
		return anim
	if not player.has_animation_library(lib_name):
		player.add_animation_library(lib_name, AnimationLibrary.new())
	var lib: AnimationLibrary = player.get_animation_library(lib_name)
	if lib.has_animation(name):
		lib.remove_animation(name)
	lib.add_animation(name, anim)
	if a.get("autoplay", false) and player is AnimationPlayer:
		player.autoplay = name if lib_name.is_empty() else "%s/%s" % [lib_name, name]
	EditorInterface.mark_scene_as_unsaved()
	return {"animation": name if lib_name.is_empty() else "%s/%s" % [lib_name, name], "length": anim.length, "tracks": anim.get_track_count()}


func _animation_list(a: Dictionary) -> Variant:
	var player = _need(a.get("player"))
	if Codec.is_fail(player):
		return player
	return Shared.describe_animations(player)


func _sprite_frames_from_sheet(a: Dictionary) -> Variant:
	var frames = Shared.sprite_frames_from_sheet(a)
	if Codec.is_fail(frames):
		return frames
	var out := {"animations": Array(frames.get_animation_names())}
	if a.has("save_path"):
		var saved = _save_res(frames, str(a.save_path))
		if Codec.is_fail(saved):
			return saved
		out.path = saved
	if a.has("target"):
		var t = _need(a.target)
		if Codec.is_fail(t):
			return t
		t.sprite_frames = frames
		if a.has("play"):
			t.animation = str(a.play)
			t.autoplay = str(a.play)
		EditorInterface.mark_scene_as_unsaved()
		out.target = _rel(t)
	return out


func _tileset_from_atlas(a: Dictionary) -> Variant:
	var ts = Shared.tileset_from_atlas(a)
	if Codec.is_fail(ts):
		return ts
	var out := {"tile_size": Codec.to_json(ts.tile_size), "sources": ts.get_source_count()}
	if a.has("save_path"):
		var saved = _save_res(ts, str(a.save_path))
		if Codec.is_fail(saved):
			return saved
		out.path = saved
	if a.has("target"):
		var t = _need(a.target)
		if Codec.is_fail(t):
			return t
		t.tile_set = load(out.path) if out.has("path") else ts
		EditorInterface.mark_scene_as_unsaved()
	return out


func _tilemap_paint(a: Dictionary) -> Variant:
	var layer = _need(a.get("path"))
	if Codec.is_fail(layer):
		return layer
	var r = Shared.tilemap_paint(layer, a)
	EditorInterface.mark_scene_as_unsaved()
	return r


# ================================================================ project

func _project_get(a: Dictionary) -> Variant:
	var out := {}
	for n in a.get("names", []):
		out[n] = Codec.to_json(ProjectSettings.get_setting(str(n)))
	if a.has("prefix"):
		for p in ProjectSettings.get_property_list():
			if str(p.name).begins_with(str(a.prefix)):
				out[p.name] = Codec.to_json(ProjectSettings.get_setting(p.name))
	return out


func _project_set(a: Dictionary) -> Variant:
	var settings: Dictionary = a.get("settings", {})
	for k in settings:
		var cur = ProjectSettings.get_setting(k) if ProjectSettings.has_setting(k) else null
		var v = Codec.from_json(settings[k], typeof(cur) if cur != null else TYPE_NIL)
		if Codec.is_fail(v):
			return v
		ProjectSettings.set_setting(k, v)
	var err := ProjectSettings.save()
	return true if err == OK else Codec.fail(error_string(err))


func _project_input_add(a: Dictionary) -> Variant:
	var actions: Dictionary = a.get("actions", {})
	if a.has("name"):
		actions[a.name] = a.get("events", [])
	var done := {}
	for action in actions:
		var events: Array = []
		var key := "input/%s" % action
		if not a.get("replace", false) and ProjectSettings.has_setting(key):
			events = (ProjectSettings.get_setting(key) as Dictionary).get("events", [])
		for spec in actions[action]:
			var ev = Shared.parse_input_event(str(spec))
			if Codec.is_fail(ev):
				return ev
			events.append(ev)
		ProjectSettings.set_setting(key, {"deadzone": float(a.get("deadzone", 0.2)), "events": events})
		done[action] = events.size()
	ProjectSettings.save()
	return done


func _project_autoload(a: Dictionary) -> Variant:
	var name := str(a.get("name", ""))
	if a.get("remove", false):
		plugin.remove_autoload_singleton(name)
		return "removed %s" % name
	var path := str(a.get("path", ""))
	if not ResourceLoader.exists(path):
		return Codec.fail("Not found: %s" % path)
	plugin.add_autoload_singleton(name, path)
	return "autoload %s -> %s" % [name, path]


func _fs_scan(_a: Dictionary) -> Variant:
	var efs := EditorInterface.get_resource_filesystem()
	var frames := 0
	# Never start a scan on top of one in progress (the editor may be mid-import).
	while (efs.is_scanning() or efs.is_importing()) and frames < 1200:
		await _tree().process_frame
		frames += 1
	efs.scan()
	await _wait_frames(2)
	while (efs.is_scanning() or efs.is_importing()) and frames < 1200:
		await _tree().process_frame
		frames += 1
	# Reload scripts that changed on disk so attached nodes see new exports.
	for scr in _open_scripts():
		if FileAccess.file_exists(scr.resource_path) and scr is GDScript:
			var disk := FileAccess.get_file_as_string(scr.resource_path)
			if disk != scr.source_code:
				scr.source_code = disk
				scr.reload(true)
	return {"scanned": true, "frames": frames}


func _open_scripts() -> Array:
	var out: Array = []
	var root := _root()
	if root:
		for n in [root] + root.find_children("*", "", true, false):
			var s = n.get_script()
			if s and not s in out:
				out.append(s)
	for s in EditorInterface.get_script_editor().get_open_scripts():
		if not s in out:
			out.append(s)
	return out


func _fs_reimport(a: Dictionary) -> Variant:
	var files := PackedStringArray(a.get("paths", []))
	EditorInterface.get_resource_filesystem().reimport_files(files)
	return files


# ================================================================ run

func _run_play(a: Dictionary) -> Variant:
	var scene := str(a.get("scene", "main"))
	match scene:
		"main":
			if str(ProjectSettings.get_setting("application/run/main_scene", "")).is_empty():
				return Codec.fail("No main scene set. Use project.set application/run/main_scene or scene.new with set_main.")
			EditorInterface.play_main_scene()
		"current":
			if _root() == null:
				return Codec.fail("No scene open")
			EditorInterface.play_current_scene()
		_:
			if not ResourceLoader.exists(scene):
				return Codec.fail("Scene not found: %s" % scene)
			EditorInterface.play_custom_scene(scene)
	await _wait_frames(5)
	return {"playing": EditorInterface.is_playing_scene(), "scene": EditorInterface.get_playing_scene(), "hint": "The game opens its own runtime bridge (default port 6551) once its first frame runs."}
