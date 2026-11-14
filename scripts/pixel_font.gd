class_name PixelFont
extends RefCounted
## Builds a crisp bitmap FontFile from assets/ui/font.png + font.json (art/make_font.py).
## Native size is 9px; use font_size 9 for body text and 18 for 2x titles so pixels stay square.

const ATLAS := "res://assets/ui/font.png"
const META := "res://assets/ui/font.json"
const SIZE := 9
const LINE_GAP := 1

static var _font: FontFile
static var _theme: Theme

static func font() -> FontFile:
	if _font != null:
		return _font
	var meta = JSON.parse_string(FileAccess.get_file_as_string(META))
	var image: Image = load(ATLAS).get_image()
	var f := FontFile.new()
	f.fixed_size = SIZE
	f.fixed_size_scale_mode = TextServer.FIXED_SIZE_SCALE_INTEGER_ONLY
	f.allow_system_fallback = false
	var size := Vector2i(SIZE, 0)
	f.set_texture_image(0, size, 0, image)
	var ascent: int = int(meta.ascent)
	f.set_cache_ascent(0, SIZE, ascent + 1)
	f.set_cache_descent(0, SIZE, int(meta.height) - ascent + LINE_GAP)
	var cell := Vector2(meta.cell[0], meta.cell[1])
	var cols: int = int(meta.cols)
	for i in meta.chars.size():
		var code: int = String(meta.chars[i]).unicode_at(0)
		var w: int = int(meta.widths[i])
		var uv := Rect2(Vector2(i % cols, i / cols) * cell, Vector2(w, cell.y))
		f.set_glyph_advance(0, SIZE, code, Vector2(w + 1, 0))
		f.set_glyph_offset(0, size, code, Vector2(0, -ascent))
		f.set_glyph_size(0, size, code, uv.size)
		f.set_glyph_uv_rect(0, size, code, uv)
		f.set_glyph_texture_idx(0, size, code, 0)
	_font = f
	return f

## A theme that makes every Control under it use the pixel font at its native size.
static func theme() -> Theme:
	if _theme == null:
		_theme = Theme.new()
		_theme.default_font = font()
		_theme.default_font_size = SIZE
	return _theme
