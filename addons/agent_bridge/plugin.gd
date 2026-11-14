@tool
extends EditorPlugin
## Agent Bridge: exposes the editor to AI agents over a localhost JSON socket.
## Port: GODOT_AGENT_EDITOR_PORT env var, default 6550.

const BridgeServer := preload("res://addons/agent_bridge/bridge_server.gd")
const LogCapture := preload("res://addons/agent_bridge/log_capture.gd")
const EditorCommands := preload("res://addons/agent_bridge/editor_commands.gd")
const RUNTIME_AUTOLOAD := "AgentRuntime"
const RUNTIME_PATH := "res://addons/agent_bridge/runtime.gd"

var _server: BridgeServer
var _logs: LogCapture
var _commands: EditorCommands
var _started := false
var _idle_frames := 0


func _enable_plugin() -> void:
	if not ProjectSettings.has_setting("autoload/" + RUNTIME_AUTOLOAD):
		add_autoload_singleton(RUNTIME_AUTOLOAD, RUNTIME_PATH)


func _disable_plugin() -> void:
	if ProjectSettings.has_setting("autoload/" + RUNTIME_AUTOLOAD):
		remove_autoload_singleton(RUNTIME_AUTOLOAD)


func _enter_tree() -> void:
	_logs = LogCapture.new()
	OS.add_logger(_logs)
	_commands = EditorCommands.new(self, _logs)
	_server = BridgeServer.new()
	_server.logs = _logs
	_server.handler = _commands.handle
	# The server starts in _process once the editor has finished its startup scan/import:
	# accepting commands while the editor is still initializing can crash it.


func _start_server() -> void:
	_started = true
	var env_port := OS.get_environment("GODOT_AGENT_EDITOR_PORT")
	var port := int(env_port) if env_port.is_valid_int() else 6550
	var err := _server.start(port)
	if err == OK:
		print("[AgentBridge] editor bridge listening on 127.0.0.1:%d" % _server.port)
	else:
		push_warning("[AgentBridge] could not listen on port %d (%s). Is another editor using it? Set GODOT_AGENT_EDITOR_PORT." % [port, error_string(err)])


func _exit_tree() -> void:
	if _server:
		_server.stop()
	if _logs:
		OS.remove_logger(_logs)
	_server = null
	_commands = null


func _process(_delta: float) -> void:
	if _server == null:
		return
	if not _started:
		var efs := EditorInterface.get_resource_filesystem()
		if efs.is_scanning() or efs.is_importing():
			_idle_frames = 0
		else:
			_idle_frames += 1
			if _idle_frames >= 30:
				_start_server()
		return
	_server.poll()
