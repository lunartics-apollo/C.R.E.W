extends Logger
## Ring buffer of engine messages and errors. Called from any thread, so guarded by a mutex.

const MAX_ENTRIES := 3000
const KINDS := ["error", "warning", "script_error", "shader_error"]

var _mutex := Mutex.new()
var _entries: Array[Dictionary] = []
var _seq := 0


func _log_message(message: String, error: bool) -> void:
	_push("stderr" if error else "stdout", message.strip_edges(false, true))


func _log_error(function: String, file: String, line: int, code: String, rationale: String,
		_editor_notify: bool, error_type: int, script_backtraces: Array[ScriptBacktrace]) -> void:
	var msg := rationale if not rationale.is_empty() else code
	var where := "%s:%d" % [file, line]
	if not function.is_empty():
		where += " in %s()" % function
	var text := "%s  [%s]" % [msg, where]
	# Keep only frames from user code; the bridge's own frames are noise for the agent.
	for bt in script_backtraces:
		if bt == null or bt.is_empty():
			continue
		for i in bt.get_frame_count():
			var f := bt.get_frame_file(i)
			if f.begins_with("res://addons/agent_bridge/") or f.begins_with("gdscript://"):
				continue
			text += "\n    at %s (%s:%d)" % [bt.get_frame_function(i), f, bt.get_frame_line(i)]
	_push(KINDS[clampi(error_type, 0, 3)], text)


func _push(kind: String, text: String) -> void:
	_mutex.lock()
	_seq += 1
	_entries.append({"seq": _seq, "kind": kind, "text": text, "time": Time.get_ticks_msec()})
	if _entries.size() > MAX_ENTRIES:
		_entries = _entries.slice(_entries.size() - MAX_ENTRIES)
	_mutex.unlock()


func mark() -> int:
	_mutex.lock()
	var s := _seq
	_mutex.unlock()
	return s


## Entries with seq > since. kinds: optional filter, e.g. ["error", "script_error"].
func since(since_seq: int, kinds: Array = [], limit := 300) -> Array:
	_mutex.lock()
	var out: Array = []
	for e in _entries:
		if e.seq > since_seq and (kinds.is_empty() or e.kind in kinds):
			out.append(e.duplicate())
	_mutex.unlock()
	if out.size() > limit:
		out = out.slice(out.size() - limit)
	return out


func errors_since(since_seq: int) -> Array:
	var out: Array = []
	for e in since(since_seq, ["error", "script_error", "shader_error"], 30):
		if "rendering/dummy/" in e.text:
			continue  # headless renderer noise
		out.append(e.text)
	return out


func clear() -> void:
	_mutex.lock()
	_entries.clear()
	_mutex.unlock()
