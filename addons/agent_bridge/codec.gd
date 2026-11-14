@tool
extends RefCounted
## JSON <-> Variant conversion, guided by the target property's type.
##
## Accepted input forms (when the target type is known):
##   Vector2/3/4(i), Color, Rect2, Quaternion  <- [x, y, ...] arrays
##   Color                                     <- "#rrggbb[aa]" or a named color ("red")
##   any type                                  <- Godot literal string, e.g. "Vector3(0, 1, 0)"
##   Resource / Object                         <- "res://path.ext" or "uid://..."
##   new Object                                <- {"_type": "BoxMesh", "size": [1, 2, 1], ...}
##   int / enum                                <- number, or the constant name ("FLAG_X")

const MAX_ARRAY := 200


static func fail(msg: String) -> Dictionary:
	return {"__error": msg}


static func is_fail(v) -> bool:
	return typeof(v) == TYPE_DICTIONARY and v.has("__error") and v.size() == 1


# ---------------------------------------------------------------- Variant -> JSON

static func to_json(v, depth := 0):
	if depth > 12:
		return "<max depth>"
	match typeof(v):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_STRING:
			return v
		TYPE_FLOAT:
			if is_nan(v) or is_inf(v):
				return str(v)
			return v
		TYPE_STRING_NAME, TYPE_NODE_PATH:
			return str(v)
		TYPE_DICTIONARY:
			var d := {}
			for k in v:
				d[str(k) if typeof(k) in [TYPE_STRING, TYPE_STRING_NAME] else var_to_str(k)] = to_json(v[k], depth + 1)
			return d
		TYPE_ARRAY, TYPE_PACKED_STRING_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, \
		TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY:
			var a := []
			for i in mini(v.size(), MAX_ARRAY):
				a.append(to_json(v[i], depth + 1))
			if v.size() > MAX_ARRAY:
				a.append("<... %d more>" % (v.size() - MAX_ARRAY))
			return a
		TYPE_PACKED_BYTE_ARRAY:
			return "<PackedByteArray size=%d>" % v.size()
		TYPE_OBJECT:
			return object_ref(v)
		_:
			var s := var_to_str(v)
			return s if s.length() < 4000 else s.substr(0, 4000) + "...<truncated>"


static func object_ref(o: Object):
	if o == null or not is_instance_valid(o):
		return null
	if o is Node:
		var n := o as Node
		return {"_node": str(n.get_path()) if n.is_inside_tree() else n.name, "_class": n.get_class()}
	if o is Resource:
		var r := o as Resource
		var d := {"_class": r.get_class()}
		if not r.resource_path.is_empty():
			d["_resource"] = r.resource_path
		if r.get_script():
			d["_script"] = (r.get_script() as Script).resource_path
		return d
	return {"_class": o.get_class()}


# ---------------------------------------------------------------- JSON -> Variant

## Convert `v` so it fits a property of `type` (TYPE_*). `class_hint` is the property
## class name for objects (e.g. "Texture2D"), used to validate {"_type"} objects.
static func from_json(v, type := TYPE_NIL, class_hint := ""):
	if v == null:
		return null
	match type:
		TYPE_NIL:
			return _from_json_untyped(v)
		TYPE_STRING:
			return str(v) if typeof(v) != TYPE_STRING else v
		TYPE_STRING_NAME:
			return StringName(str(v))
		TYPE_NODE_PATH:
			return NodePath(str(v))
		TYPE_BOOL:
			if typeof(v) == TYPE_STRING:
				return v.to_lower() in ["true", "1", "yes", "on"]
			return bool(v)
		TYPE_INT:
			if typeof(v) == TYPE_STRING and not v.is_valid_int():
				var parsed = str_to_var(v)
				if typeof(parsed) == TYPE_INT:
					return parsed
				return v  # enum name; resolved by caller via resolve_enum()
			return int(v)
		TYPE_FLOAT:
			return float(v)
		TYPE_COLOR:
			if typeof(v) == TYPE_STRING:
				if v.begins_with("Color("):
					return str_to_var(v)
				return Color.from_string(v, Color.MAGENTA)
			if typeof(v) == TYPE_ARRAY:
				return Color(v[0], v[1], v[2], v[3] if v.size() > 3 else 1.0)
		TYPE_VECTOR2, TYPE_VECTOR2I, TYPE_VECTOR3, TYPE_VECTOR3I, TYPE_VECTOR4, TYPE_VECTOR4I, \
		TYPE_RECT2, TYPE_RECT2I, TYPE_QUATERNION, TYPE_PLANE:
			if typeof(v) == TYPE_ARRAY:
				return _vec_from_array(v, type)
			if typeof(v) == TYPE_DICTIONARY:
				return _vec_from_array(_dict_to_components(v, type), type)
		TYPE_OBJECT:
			return _object_from_json(v, class_hint)
		TYPE_ARRAY:
			if typeof(v) == TYPE_ARRAY:
				var a := []
				for item in v:
					a.append(_from_json_untyped(item))
				return a
		TYPE_PACKED_VECTOR2_ARRAY:
			if typeof(v) == TYPE_ARRAY:
				var pv := PackedVector2Array()
				for item in v:
					pv.append(from_json(item, TYPE_VECTOR2))
				return pv
		TYPE_PACKED_VECTOR3_ARRAY:
			if typeof(v) == TYPE_ARRAY:
				var pv3 := PackedVector3Array()
				for item in v:
					pv3.append(from_json(item, TYPE_VECTOR3))
				return pv3
		TYPE_PACKED_COLOR_ARRAY:
			if typeof(v) == TYPE_ARRAY:
				var pc := PackedColorArray()
				for item in v:
					pc.append(from_json(item, TYPE_COLOR))
				return pc
		TYPE_PACKED_STRING_ARRAY:
			if typeof(v) == TYPE_ARRAY:
				return PackedStringArray(v.map(func(x): return str(x)))
		TYPE_PACKED_FLOAT32_ARRAY:
			if typeof(v) == TYPE_ARRAY:
				return PackedFloat32Array(v)
		TYPE_PACKED_INT32_ARRAY:
			if typeof(v) == TYPE_ARRAY:
				return PackedInt32Array(v.map(func(x): return int(x)))
		TYPE_DICTIONARY:
			if typeof(v) == TYPE_DICTIONARY:
				var d := {}
				for k in v:
					d[k] = _from_json_untyped(v[k])
				return d
	# Fallback: Godot literal string for any type.
	if typeof(v) == TYPE_STRING:
		var parsed = str_to_var(v)
		if parsed != null:
			return parsed
	return v


static func _from_json_untyped(v):
	if typeof(v) == TYPE_STRING:
		if v.begins_with("res://") or v.begins_with("uid://"):
			if ResourceLoader.exists(v):
				return load(v)
			return v
		if _looks_like_literal(v):
			var parsed = str_to_var(v)
			if parsed != null:
				return parsed
		return v
	if typeof(v) == TYPE_FLOAT and v == floorf(v) and absf(v) < 9.0e15:
		return int(v)
	if typeof(v) == TYPE_DICTIONARY:
		if v.has("_type"):
			return _object_from_json(v, "")
		var d := {}
		for k in v:
			d[k] = _from_json_untyped(v[k])
		return d
	if typeof(v) == TYPE_ARRAY:
		var a := []
		for item in v:
			a.append(_from_json_untyped(item))
		return a
	return v


static func _looks_like_literal(s: String) -> bool:
	var re := RegEx.create_from_string("^(Vector[234]i?|Color|Rect2i?|Transform[23]D|Basis|Quaternion|Plane|AABB|Projection|Packed\\w+Array|NodePath|StringName|&|\\^)[\\(\"]")
	return re.search(s) != null


static func _vec_from_array(a: Array, type: int):
	var f := a.map(func(x): return float(x))
	match type:
		TYPE_VECTOR2: return Vector2(f[0], f[1])
		TYPE_VECTOR2I: return Vector2i(int(f[0]), int(f[1]))
		TYPE_VECTOR3: return Vector3(f[0], f[1], f[2])
		TYPE_VECTOR3I: return Vector3i(int(f[0]), int(f[1]), int(f[2]))
		TYPE_VECTOR4: return Vector4(f[0], f[1], f[2], f[3])
		TYPE_VECTOR4I: return Vector4i(int(f[0]), int(f[1]), int(f[2]), int(f[3]))
		TYPE_RECT2: return Rect2(f[0], f[1], f[2], f[3])
		TYPE_RECT2I: return Rect2i(int(f[0]), int(f[1]), int(f[2]), int(f[3]))
		TYPE_QUATERNION: return Quaternion(f[0], f[1], f[2], f[3])
		TYPE_PLANE: return Plane(f[0], f[1], f[2], f[3])
	return null


static func _dict_to_components(d: Dictionary, type: int) -> Array:
	match type:
		TYPE_RECT2, TYPE_RECT2I:
			return [d.get("x", 0), d.get("y", 0), d.get("w", d.get("width", 0)), d.get("h", d.get("height", 0))]
		_:
			return [d.get("x", 0), d.get("y", 0), d.get("z", 0), d.get("w", 0)]


static func _object_from_json(v, class_hint: String):
	if v is Object:
		return v
	if typeof(v) == TYPE_STRING:
		if v.is_empty():
			return null
		if v.begins_with("res://") or v.begins_with("uid://") or v.begins_with("user://"):
			if not ResourceLoader.exists(v):
				return fail("Resource not found: %s" % v)
			return load(v)
		# Bare class name -> fresh instance with defaults.
		if ClassDB.class_exists(v) and ClassDB.can_instantiate(v):
			return ClassDB.instantiate(v)
		var parsed = str_to_var(v)
		if parsed is Object:
			return parsed
		return fail("Cannot convert '%s' to an object (expected res:// path, class name or {\"_type\": ...})" % v)
	if typeof(v) == TYPE_DICTIONARY and v.has("_type"):
		var t := str(v._type)
		var obj: Object = instantiate_class(t)
		if obj == null:
			return fail("Unknown or non-instantiable class: %s" % t)
		if not class_hint.is_empty() and ClassDB.class_exists(class_hint) and not obj.is_class(class_hint):
			return fail("%s is not a %s" % [t, class_hint])
		for key in v:
			if key == "_type":
				continue
			var r = set_prop(obj, key, v[key])
			if is_fail(r):
				return r
		return obj
	return fail("Cannot convert %s to an object" % JSON.stringify(v))


## Instantiates an engine class or a global script class (class_name).
static func instantiate_class(type_name: String) -> Object:
	if ClassDB.class_exists(type_name):
		if ClassDB.can_instantiate(type_name):
			return ClassDB.instantiate(type_name)
		return null
	for g in ProjectSettings.get_global_class_list():
		if g["class"] == type_name:
			var scr: Script = load(g.path)
			if scr and scr.can_instantiate():
				return scr.new()
	return null


# ---------------------------------------------------------------- properties

static func prop_info(obj: Object, prop: String) -> Dictionary:
	for p in obj.get_property_list():
		if p.name == prop:
			return p
	return {}


## Sets `prop` (may be an indexed path like "material:albedo_color" or "position:x").
static func set_prop(obj: Object, prop: String, value) -> Variant:
	var converted = convert_for(obj, prop, value)
	if is_fail(converted):
		return converted
	if ":" in prop:
		obj.set_indexed(NodePath(prop), converted)
	else:
		if prop_info(obj, prop).is_empty() and not (prop in obj):
			return fail("%s has no property '%s'" % [obj.get_class(), prop])
		obj.set(prop, converted)
	return true


## Converts a JSON value to what `obj.prop` expects without assigning it.
static func convert_for(obj: Object, prop: String, value) -> Variant:
	var type := TYPE_NIL
	var class_hint := ""
	var info := {}
	if ":" in prop:
		var current = obj.get_indexed(NodePath(prop))
		type = typeof(current)
		if current is Object:
			class_hint = current.get_class()
	else:
		info = prop_info(obj, prop)
		if not info.is_empty():
			type = info.type
			class_hint = info.class_name if info.type == TYPE_OBJECT else ""
			if info.type == TYPE_OBJECT and class_hint.is_empty() and info.hint == PROPERTY_HINT_RESOURCE_TYPE:
				class_hint = info.hint_string.get_slice(",", 0)
		else:
			type = typeof(obj.get(prop))
	var converted = from_json(value, type, class_hint)
	if is_fail(converted):
		return converted
	if type == TYPE_INT and typeof(converted) == TYPE_STRING:
		var e = resolve_enum(obj, info, converted)
		if e == null:
			return fail("Cannot convert '%s' to int for %s.%s" % [converted, obj.get_class(), prop])
		converted = e
	return converted


## Resolves an enum/flag constant name ("MODE_RIGID", or "A|B") to its int value.
static func resolve_enum(obj: Object, info: Dictionary, name: String):
	var total := 0
	for part in name.split("|"):
		part = part.strip_edges()
		var found = null
		# Hint string looks like "Disabled:0,Enabled:1" or "Disabled,Enabled".
		if not info.is_empty() and info.hint in [PROPERTY_HINT_ENUM, PROPERTY_HINT_FLAGS]:
			var idx := 0
			for opt in info.hint_string.split(","):
				var label: String = opt.get_slice(":", 0).strip_edges()
				var val: int = int(opt.get_slice(":", 1)) if ":" in opt else (idx if info.hint == PROPERTY_HINT_ENUM else 1 << idx)
				var up: String = label.to_snake_case().to_upper().replace(" ", "_")
				if label.to_lower() == part.to_lower() or up == part.to_upper() or part.to_upper().ends_with("_" + up):
					found = val
					break
				idx += 1
		if found == null:
			var cls := obj.get_class()
			while not cls.is_empty() and found == null:
				if ClassDB.class_has_integer_constant(cls, part):
					found = ClassDB.class_get_integer_constant(cls, part)
				cls = ClassDB.get_parent_class(cls)
		if found == null:
			return null
		total |= int(found)
	return total


## Editor-visible properties whose value differs from the class default.
static func changed_props(obj: Object, all := false) -> Dictionary:
	var out := {}
	var cls := obj.get_class()
	for p in obj.get_property_list():
		if not (p.usage & PROPERTY_USAGE_EDITOR) or p.usage & PROPERTY_USAGE_CATEGORY or p.usage & PROPERTY_USAGE_GROUP or p.usage & PROPERTY_USAGE_SUBGROUP:
			continue
		var val = obj.get(p.name)
		if not all:
			var def = null
			if p.usage & PROPERTY_USAGE_SCRIPT_VARIABLE:
				var scr: Script = obj.get_script()
				def = scr.get_property_default_value(p.name) if scr else null
			else:
				def = ClassDB.class_get_property_default_value(cls, p.name)
			if typeof(def) == typeof(val) and def == val:
				continue
			if p.name == "script" and val == null:
				continue
		out[p.name] = to_json(val)
	return out
