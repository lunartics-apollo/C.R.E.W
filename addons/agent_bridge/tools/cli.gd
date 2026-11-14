extends SceneTree
## Headless helper used by the MCP server when no editor is open.
##   godot --headless --path <project> -s res://addons/agent_bridge/tools/cli.gd -- <command> [args]
## Commands: validate | class_info <Name> | class_search <query> [base]
## Prints one JSON document between @@AGENT_JSON_BEGIN@@ / @@AGENT_JSON_END@@ markers.

const LogCapture := preload("res://addons/agent_bridge/log_capture.gd")
const Shared := preload("res://addons/agent_bridge/shared_commands.gd")
const Codec := preload("res://addons/agent_bridge/codec.gd")

var _logs := LogCapture.new()


func _initialize() -> void:
	OS.add_logger(_logs)
	var args := OS.get_cmdline_user_args()
	var cmd := args[0] if args.size() > 0 else "validate"
	var result
	match cmd:
		"validate":
			result = _validate()
		"class_info":
			result = Shared.class_info(args[1] if args.size() > 1 else "")
		"class_search":
			result = Shared.class_search(args[1] if args.size() > 1 else "", args[2] if args.size() > 2 else "")
		_:
			result = Codec.fail("unknown command %s" % cmd)
	OS.remove_logger(_logs)
	print("@@AGENT_JSON_BEGIN@@")
	print(JSON.stringify(Codec.to_json(result)))
	print("@@AGENT_JSON_END@@")
	quit()


func _validate() -> Dictionary:
	var files: Array = []
	_walk("res://", files)
	var problems := {}
	var checked := 0
	for f in files:
		var mark := _logs.mark()
		var res = ResourceLoader.load(f, "", ResourceLoader.CACHE_MODE_IGNORE)
		checked += 1
		var errs: Array = _logs.since(mark, ["error", "script_error", "shader_error", "warning"], 30).map(func(e): return "%s: %s" % [e.kind, e.text])
		if res == null and errs.is_empty():
			errs.append("error: failed to load")
		if not errs.is_empty():
			problems[f] = errs
	return {"checked": checked, "ok": problems.is_empty(), "problems": problems}


func _walk(dir: String, out: Array) -> void:
	var d := DirAccess.open(dir)
	if d == null:
		return
	d.include_hidden = false
	for sub in d.get_directories():
		if sub.begins_with(".") or dir.path_join(sub) == "res://addons/agent_bridge":
			continue
		if FileAccess.file_exists(dir.path_join(sub).path_join(".gdignore")):
			continue
		_walk(dir.path_join(sub), out)
	for f in d.get_files():
		if f.get_extension() in ["gd", "tscn", "tres", "gdshader"]:
			out.append(dir.path_join(f))
