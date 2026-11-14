@tool
class_name AgentProcgen
extends RefCounted
## Procedural 3D building blocks for agents (low-poly style). All static.
## Use from the `gdscript` tool (target=editor) to build and save content, e.g.:
##   var terrain := AgentProcgen.terrain(64, 64, 8.0, 3)
##   add(terrain)                                    # adds to the open scene and sets owners
##   AgentProcgen.scatter(terrain, func(i, rng): return AgentProcgen.tree(i), 40, Vector2(60, 60), 1, terrain)
## Or bake a mesh to disk: AgentProcgen.save(AgentProcgen.rock(7), "res://assets/models/rock_7.res")


static func material(color: Color, roughness := 0.9, metallic := 0.0, vertex_colors := false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = roughness
	m.metallic = metallic
	m.vertex_color_use_as_albedo = vertex_colors
	m.vertex_color_is_srgb = vertex_colors
	return m


## Flat-shaded noisy rock mesh.
static func rock(seed := 0, radius := 1.0, roughness := 0.35, color := Color(0.45, 0.43, 0.4)) -> ArrayMesh:
	var noise := FastNoiseLite.new()
	noise.seed = seed
	noise.frequency = 0.9 / radius
	var sphere := SphereMesh.new()
	sphere.radius = radius
	sphere.height = radius * 2.0
	sphere.radial_segments = 10
	sphere.rings = 6
	var arrays := sphere.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var squash := Vector3(rng.randf_range(0.8, 1.3), rng.randf_range(0.55, 0.9), rng.randf_range(0.8, 1.3))
	for i in verts.size():
		var v := verts[i]
		var n := noise.get_noise_3dv(v) * roughness
		verts[i] = v * (1.0 + n) * squash
	# Seam vertices share positions; displacement is position-based so the mesh stays closed.
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	for i in idx:
		st.add_vertex(verts[i])
	st.generate_normals()
	st.set_material(material(color))
	return st.commit()


## Low-poly tree. style: "pine" or "round". Returns a Node3D (trunk + foliage) with a collision capsule.
static func tree(seed := 0, height := 4.0, style := "pine") -> Node3D:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	height *= rng.randf_range(0.8, 1.25)
	var root := StaticBody3D.new()
	root.name = "Tree"
	var trunk := MeshInstance3D.new()
	trunk.name = "Trunk"
	var cyl := CylinderMesh.new()
	cyl.top_radius = height * 0.04
	cyl.bottom_radius = height * 0.06
	cyl.height = height * 0.45
	cyl.radial_segments = 6
	cyl.material = material(Color(0.4, 0.26, 0.15))
	trunk.mesh = cyl
	trunk.position.y = cyl.height / 2.0
	root.add_child(trunk)
	var leaf_col := Color.from_hsv(rng.randf_range(0.25, 0.38), rng.randf_range(0.5, 0.7), rng.randf_range(0.35, 0.55))
	var leaf_mat := material(leaf_col)
	if style == "round":
		for i in 3:
			var blob := MeshInstance3D.new()
			blob.name = "Leaves%d" % i
			var s := SphereMesh.new()
			s.radius = height * rng.randf_range(0.18, 0.26)
			s.height = s.radius * 2.0
			s.radial_segments = 8
			s.rings = 5
			s.material = leaf_mat
			blob.mesh = s
			blob.position = Vector3(rng.randf_range(-0.15, 0.15) * height, height * (0.55 + i * 0.12), rng.randf_range(-0.15, 0.15) * height)
			root.add_child(blob)
	else:
		for i in 3:
			var cone := MeshInstance3D.new()
			cone.name = "Leaves%d" % i
			var c := CylinderMesh.new()
			c.top_radius = 0.0
			c.bottom_radius = height * (0.28 - i * 0.06)
			c.height = height * 0.38
			c.radial_segments = 7
			c.material = leaf_mat
			cone.mesh = c
			cone.position.y = height * (0.42 + i * 0.18)
			cone.rotation.y = rng.randf() * TAU
			root.add_child(cone)
	var col := CollisionShape3D.new()
	col.name = "Collision"
	var cap := CapsuleShape3D.new()
	cap.radius = height * 0.07
	cap.height = height * 0.9
	col.shape = cap
	col.position.y = cap.height / 2.0
	root.add_child(col)
	return root


## Heightmap terrain with vertex colors (grass/rock/snow) and HeightMapShape3D collision.
## size_x/size_z in meters (also the vertex count), centered on the origin.
static func terrain(size_x := 64, size_z := 64, height := 8.0, seed := 0, frequency := 0.02, colors: Array = []) -> StaticBody3D:
	var noise := FastNoiseLite.new()
	noise.seed = seed
	noise.frequency = frequency
	noise.fractal_octaves = 4
	var cols: Array = colors if colors.size() >= 3 else [Color(0.32, 0.5, 0.22), Color(0.45, 0.42, 0.38), Color(0.95, 0.95, 0.97)]
	var w := size_x + 1
	var d := size_z + 1
	var heights := PackedFloat32Array()
	heights.resize(w * d)
	for z in d:
		for x in w:
			heights[z * w + x] = (noise.get_noise_2d(x, z) * 0.5 + 0.5) * height
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var off := Vector3(size_x / 2.0, 0, size_z / 2.0)
	for z in size_z:
		for x in size_x:
			var quad := [Vector2i(x, z), Vector2i(x + 1, z), Vector2i(x, z + 1), Vector2i(x + 1, z + 1)]
			for tri in [[0, 1, 2], [1, 3, 2]]:
				var ys := 0.0
				for t in tri:
					ys += heights[quad[t].y * w + quad[t].x]
				ys /= 3.0
				var h := ys / height
				var col: Color = cols[0].lerp(cols[1], smoothstep(0.45, 0.65, h)).lerp(cols[2], smoothstep(0.78, 0.9, h))
				for t in tri:
					var q: Vector2i = quad[t]
					st.set_color(col)
					st.add_vertex(Vector3(q.x, heights[q.y * w + q.x], q.y) - off)
	st.generate_normals()
	st.set_material(material(Color.WHITE, 0.95, 0.0, true))
	var body := StaticBody3D.new()
	body.name = "Terrain"
	var mi := MeshInstance3D.new()
	mi.name = "Mesh"
	mi.mesh = st.commit()
	body.add_child(mi)
	var shape := HeightMapShape3D.new()
	shape.map_width = w
	shape.map_depth = d
	shape.map_data = heights
	var cs := CollisionShape3D.new()
	cs.name = "Collision"
	cs.shape = shape
	body.add_child(cs)
	body.set_meta("heights", heights)
	body.set_meta("grid", Vector2i(w, d))
	return body


## Height of a terrain() body at world-space x/z (bilinear). Returns 0 outside.
static func terrain_height(terrain_body: Node3D, x: float, z: float) -> float:
	var heights: PackedFloat32Array = terrain_body.get_meta("heights", PackedFloat32Array())
	var grid: Vector2i = terrain_body.get_meta("grid", Vector2i.ZERO)
	if heights.is_empty():
		return 0.0
	var lx := x - terrain_body.global_position.x + (grid.x - 1) / 2.0
	var lz := z - terrain_body.global_position.z + (grid.y - 1) / 2.0
	if lx < 0 or lz < 0 or lx >= grid.x - 1 or lz >= grid.y - 1:
		return 0.0
	var x0 := int(lx)
	var z0 := int(lz)
	var fx := lx - x0
	var fz := lz - z0
	var h00 := heights[z0 * grid.x + x0]
	var h10 := heights[z0 * grid.x + x0 + 1]
	var h01 := heights[(z0 + 1) * grid.x + x0]
	var h11 := heights[(z0 + 1) * grid.x + x0 + 1]
	return lerpf(lerpf(h00, h10, fx), lerpf(h01, h11, fx), fz) + terrain_body.global_position.y


## Places `count` nodes from `make.call(i, rng) -> Node3D` randomly in `area` (centered on parent).
## If `on_terrain` is a terrain() body, nodes are placed on its surface.
## Nodes are added to `parent`; owners are set to parent.owner (or parent) so they save with the scene.
static func scatter(parent: Node, make: Callable, count: int, area: Vector2, seed := 0, on_terrain: Node3D = null, min_distance := 0.0) -> Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var placed: Array = []
	var owner: Node = parent.owner if parent.owner else parent
	var tries := 0
	while placed.size() < count and tries < count * 20:
		tries += 1
		var p := Vector3(rng.randf_range(-area.x / 2, area.x / 2), 0, rng.randf_range(-area.y / 2, area.y / 2))
		if min_distance > 0 and placed.any(func(n): return Vector2(n.position.x, n.position.z).distance_to(Vector2(p.x, p.z)) < min_distance):
			continue
		var n: Node3D = make.call(placed.size(), rng)
		if on_terrain:
			p.y = terrain_height(on_terrain, p.x, p.z) - (parent as Node3D).global_position.y if parent is Node3D else terrain_height(on_terrain, p.x, p.z)
		n.position = p
		n.rotation.y = rng.randf() * TAU
		parent.add_child(n, true)
		_own(n, owner)
		placed.append(n)
	return placed


static func _own(n: Node, owner: Node) -> void:
	n.owner = owner
	if not n.scene_file_path.is_empty():
		return
	for c in n.get_children():
		_own(c, owner)


## Saves a Resource (.tres text / .res binary).
static func save(res: Resource, path: String) -> Error:
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return ResourceSaver.save(res, path)


## Packs a node tree into a reusable .tscn (owners are set automatically).
static func save_scene(node: Node, path: String) -> Error:
	for c in node.get_children():
		_own(c, node)
	var ps := PackedScene.new()
	var err := ps.pack(node)
	if err != OK:
		return err
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return ResourceSaver.save(ps, path)
