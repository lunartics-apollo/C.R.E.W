@tool
extends RefCounted
## Newline-delimited JSON over TCP, bound to 127.0.0.1 only.
## Request:  {"id": 1, "cmd": "node.add", "args": {...}}
## Response: {"id": 1, "ok": true, "result": ...} or {"id": 1, "ok": false, "error": "..."}

const Codec := preload("res://addons/agent_bridge/codec.gd")

## func(cmd: String, args: Dictionary) -> Variant. May be a coroutine.
## Return Codec.fail("msg") to report an error.
var handler: Callable
## Optional LogCapture; new error lines emitted while a command runs are attached to the reply.
var logs: Object
var port := 0

var _server := TCPServer.new()
var _clients: Array[Dictionary] = []


func start(first_port: int, attempts := 1) -> Error:
	var err := ERR_CANT_OPEN
	for p in range(first_port, first_port + attempts):
		err = _server.listen(p, "127.0.0.1")
		if err == OK:
			port = p
			return OK
	return err


func stop() -> void:
	for c in _clients:
		(c.peer as StreamPeerTCP).disconnect_from_host()
	_clients.clear()
	_server.stop()


func is_listening() -> bool:
	return _server.is_listening()


func poll() -> void:
	if not _server.is_listening():
		return
	while _server.is_connection_available():
		var peer := _server.take_connection()
		peer.set_no_delay(true)
		_clients.append({"peer": peer, "buf": PackedByteArray()})
	for c in _clients.duplicate():
		var peer: StreamPeerTCP = c.peer
		peer.poll()
		if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
			_clients.erase(c)
			continue
		var n := peer.get_available_bytes()
		if n > 0:
			var got := peer.get_data(n)
			if got[0] == OK:
				c.buf.append_array(got[1])
		while true:
			var i: int = c.buf.find(10)
			if i < 0:
				break
			var line: String = c.buf.slice(0, i).get_string_from_utf8()
			c.buf = c.buf.slice(i + 1)
			if not line.strip_edges().is_empty():
				_handle(peer, line)


func _handle(peer: StreamPeerTCP, line: String) -> void:
	var req = JSON.parse_string(line)
	if typeof(req) != TYPE_DICTIONARY:
		_send(peer, {"id": null, "ok": false, "error": "Request is not a JSON object"})
		return
	var id = req.get("id")
	if typeof(id) == TYPE_FLOAT and id == floorf(id):
		id = int(id)
	var cmd := str(req.get("cmd", ""))
	var args = req.get("args", {})
	if typeof(args) != TYPE_DICTIONARY:
		args = {}
	var mark: int = logs.mark() if logs else 0
	var result = await handler.call(cmd, args)
	var new_errors: Array = logs.errors_since(mark) if logs else []
	if typeof(result) == TYPE_DICTIONARY and result.has("__logs_handled"):
		result.erase("__logs_handled")
		new_errors.clear()
	var reply := {"id": id}
	if Codec.is_fail(result):
		reply.ok = false
		reply.error = result.__error
	elif result == null and not new_errors.is_empty():
		# GDScript has no exceptions: a runtime error aborts the call and yields null.
		reply.ok = false
		reply.error = "Command '%s' failed with engine errors" % cmd
	else:
		reply.ok = true
		reply.result = Codec.to_json(result)
	if not new_errors.is_empty():
		reply.engine_errors = new_errors
	_send(peer, reply)


func _send(peer: StreamPeerTCP, msg: Dictionary) -> void:
	if peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		return
	var data := (JSON.stringify(msg) + "\n").to_utf8_buffer()
	var off := 0
	while off < data.size():
		var res := peer.put_partial_data(data.slice(off))
		if res[0] != OK:
			return
		off += int(res[1])
		if off < data.size():
			OS.delay_msec(1)
			peer.poll()
