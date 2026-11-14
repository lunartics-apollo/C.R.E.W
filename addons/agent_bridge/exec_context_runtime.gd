extends RefCounted
## Base class for code run with game.exec inside the running game. Your code becomes run().
## Available: root (current scene), tree (SceneTree), node(path), Procgen (procedural 3D helpers).

const Procgen := preload("res://addons/agent_bridge/procgen.gd")

var root: Node
var tree: SceneTree


## Absolute paths ("/root/Main/Player") or paths relative to the current scene.
func node(path: String) -> Node:
	if path.begins_with("/"):
		return tree.root.get_node_or_null(path)
	if path in ["", "."]:
		return root
	return root.get_node_or_null(path)
