@tool
extends RefCounted
## Base class for code run with editor.exec. Your code becomes the body of run().
## Available: root (edited scene root), plugin (EditorPlugin), editor (EditorInterface), Procgen,
## node(path), add(node, parent) and own(node).

const Procgen := preload("res://addons/agent_bridge/procgen.gd")

var root: Node
var plugin: EditorPlugin
var editor


## Node by path relative to the edited scene root ("." = root).
func node(path: String) -> Node:
	if path in ["", "."]:
		return root
	return root.get_node_or_null(path)


## Adds `n` under `parent` (default root) and makes it part of the saved scene.
func add(n: Node, parent: Node = null) -> Node:
	(parent if parent else root).add_child(n, true)
	own(n)
	return n


## Sets owner = root recursively so nodes created in code get saved with the scene.
func own(n: Node) -> void:
	if n != root:
		n.owner = root
	if n != root and not n.scene_file_path.is_empty():
		return
	for c in n.get_children():
		own(c)
	EditorInterface.mark_scene_as_unsaved()
