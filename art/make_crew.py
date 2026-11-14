"""Draws the crew sprite sheets, portraits and pixel UI frames.

Style target: chunky top-down pixel characters (big round head, small body, thick dark
outline, 2-3 tone shading) and framed, bevelled UI boxes. Everything is original art.

Run from the project root:  python art/make_crew.py
Outputs:
  assets/sprites/crew/<name>.png           20x26 frames; rows down/up/right, cols idle + 4 walk
  assets/sprites/crew/<name>_portrait.png  28x28 head-and-shoulders portrait
  assets/ui/*.png                          9-slice panels, slots, speech bubble, arrows
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
CREW_DIR = ROOT / "assets" / "sprites" / "crew"
UI_DIR = ROOT / "assets" / "ui"
FW, FH = 20, 26
OUTLINE = (28, 22, 34, 255)
SKIN = [(246, 200, 160), (226, 170, 128), (196, 140, 100)]
EYE = (28, 22, 34, 255)

CREW = {
    "nova":  {"hair": [(212, 96, 58), (166, 62, 40)], "suit": [(232, 132, 62), (186, 92, 40)],
              "accent": (250, 226, 120), "style": "spiky", "skin": 0},
    "orion": {"hair": [(52, 46, 58), (30, 26, 36)], "suit": [(78, 122, 200), (52, 84, 150)],
              "accent": (240, 196, 80), "style": "buzz_goggles", "skin": 2},
    "juno":  {"hair": [(150, 78, 46), (110, 54, 32)], "suit": [(236, 240, 232), (186, 198, 194)],
              "accent": (96, 184, 120), "style": "ponytail", "skin": 1},
    "kai":   {"hair": [(226, 222, 206), (176, 170, 156)], "suit": [(230, 192, 70), (180, 140, 40)],
              "accent": (70, 120, 90), "style": "cap", "skin": 0},
}


def rgba(c):
    return tuple(c) + (255,) if len(c) == 3 else c


def outline(img):
    """Adds a 1px dark outline around every opaque pixel (4-neighbour)."""
    w, h = img.size
    src = img.load()
    out = img.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] != 0:
                    dst[x, y] = OUTLINE
                    break
    return out


# ── character frames ─────────────────────────────────────────────────────────
def draw_body_side(d, c, phase, bob):
    suit, suit_dark = rgba(c["suit"][0]), rgba(c["suit"][1])
    skin = rgba(SKIN[c["skin"]])
    shoe = (70, 52, 46, 255)
    top = 14 - bob
    stride = {1: 1, 3: -1}.get(phase, 0)
    for x, col in ((8 + stride, suit_dark), (10 - stride, suit)):
        d.rectangle((x, 20 - bob, x + 2, 23), fill=col)
        d.rectangle((x, 23, x + 3, 24), fill=shoe)
    d.rectangle((7, top, 13, 20 - bob), fill=suit)
    d.rectangle((7, top + 5, 13, top + 5), fill=rgba(c["accent"]))
    d.rectangle((9 + stride, top + 1, 11 + stride, top + 5), fill=suit_dark)
    d.rectangle((9 + stride, top + 6, 11 + stride, top + 6), fill=skin)


def draw_body(d, c, facing, phase):
    bob = 1 if phase in (2, 4) else 0           # body lifts on the passing frames
    if facing == "right":
        draw_body_side(d, c, phase, bob)
        return
    suit, suit_dark = rgba(c["suit"][0]), rgba(c["suit"][1])
    skin = rgba(SKIN[c["skin"]])
    shoe = (70, 52, 46, 255)
    lifts = {1: (-1, 0), 3: (0, -1)}.get(phase, (0, 0))  # which foot is off the ground
    top = 14 - bob
    for i, x in enumerate((6, 11)):
        lift = lifts[i]
        d.rectangle((x, 20 - bob + lift, x + 2, 23 + lift), fill=suit_dark)
        d.rectangle((x - (1 if i == 0 else 0), 23 + lift, x + 2 + (1 if i == 1 else 0), 24 + lift), fill=shoe)
    d.rectangle((5, top, 14, 20 - bob), fill=suit)
    d.rectangle((5, top + 5, 14, top + 5), fill=rgba(c["accent"]))
    if facing == "down":
        d.rectangle((8, top, 11, top + 1), fill=suit_dark)       # collar
        if c["style"] == "ponytail":                             # medic cross
            d.rectangle((9, top + 2, 10, top + 4), fill=rgba(c["accent"]))
            d.rectangle((8, top + 3, 11, top + 3), fill=rgba(c["accent"]))
    swing = {1: 1, 3: -1}.get(phase, 0)
    for side, x in ((-1, 3), (1, 15)):
        dy = swing * side
        d.rectangle((x, top + 1 + dy, x + 1, top + 5 + dy), fill=suit_dark)
        d.rectangle((x, top + 6 + dy, x + 1, top + 6 + dy), fill=skin)


def draw_face(d, c, facing, y0):
    skin_dark = rgba(SKIN[min(c["skin"] + 1, 2)])
    hair, hair_dark = rgba(c["hair"][0]), rgba(c["hair"][1])
    if facing == "up":
        d.ellipse((3, y0, 16, y0 + 11), fill=hair)
        d.rectangle((5, y0 + 8, 14, y0 + 10), fill=hair_dark)
    elif facing == "down":
        d.pieslice((3, y0, 16, y0 + 12), 180, 360, fill=hair)
        d.rectangle((3, y0 + 4, 4, y0 + 7), fill=hair)
        d.rectangle((15, y0 + 4, 16, y0 + 7), fill=hair)
        d.rectangle((7, y0 + 7, 7, y0 + 8), fill=EYE)
        d.rectangle((12, y0 + 7, 12, y0 + 8), fill=EYE)
        d.point((6, y0 + 9), fill=(236, 150, 140, 255))
        d.point((13, y0 + 9), fill=(236, 150, 140, 255))
    else:
        d.pieslice((3, y0, 16, y0 + 12), 160, 360, fill=hair)
        d.rectangle((3, y0 + 3, 7, y0 + 9), fill=hair)
        d.rectangle((13, y0 + 7, 13, y0 + 8), fill=EYE)
        d.point((15, y0 + 9), fill=skin_dark)


def draw_hairstyle(d, c, facing, y0):
    hair, hair_dark = rgba(c["hair"][0]), rgba(c["hair"][1])
    style = c["style"]
    if style == "spiky":
        for x in (5, 8, 11, 14):
            d.polygon([(x - 2, y0 + 2), (x, y0 - 2), (x + 2, y0 + 2)], fill=hair)
    elif style == "buzz_goggles" and facing != "up":
        lens = (140, 220, 240, 255)
        d.rectangle((4, y0 + 3, 15, y0 + 4), fill=(110, 110, 120, 255))
        if facing == "down":
            d.rectangle((6, y0 + 2, 8, y0 + 4), fill=lens)
            d.rectangle((11, y0 + 2, 13, y0 + 4), fill=lens)
        else:
            d.rectangle((12, y0 + 2, 14, y0 + 4), fill=lens)
    elif style == "ponytail":
        tail = {"up": (8, y0 + 10, 11, y0 + 14), "right": (1, y0 + 4, 3, y0 + 10)}.get(facing, (15, y0 + 3, 17, y0 + 8))
        d.rectangle(tail, fill=hair_dark)
    elif style == "cap":
        d.pieslice((3, y0 - 1, 16, y0 + 9), 180, 360, fill=rgba(c["accent"]))
        brim = {"down": (5, y0 + 4, 14, y0 + 4), "right": (12, y0 + 3, 18, y0 + 4)}.get(facing)
        if brim:
            d.rectangle(brim, fill=(40, 70, 52, 255))


def draw_head(d, c, facing, phase):
    y0 = 2 - (1 if phase in (2, 4) else 0)
    d.ellipse((3, y0, 16, y0 + 12), fill=rgba(SKIN[c["skin"]]))
    draw_face(d, c, facing, y0)
    draw_hairstyle(d, c, facing, y0)


def make_frame(c, facing, phase):
    img = Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    draw_body(d, c, facing, phase)
    draw_head(d, c, facing, phase)
    return outline(img)


def make_sheet(c):
    sheet = Image.new("RGBA", (FW * 5, FH * 3), (0, 0, 0, 0))
    for row, facing in enumerate(("down", "up", "right")):
        for phase in range(5):
            sheet.alpha_composite(make_frame(c, facing, phase), (phase * FW, row * FH))
    return sheet


def make_portrait(c):
    img = Image.new("RGBA", (28, 28), (0, 0, 0, 0))
    bust = make_frame(c, "down", 0).crop((0, 0, FW, 20))
    img.alpha_composite(bust.resize((24, 24), Image.NEAREST), (2, 3))
    return img


# ── UI frames (9-slice) ──────────────────────────────────────────────────────
def bevel_box(size, fill, light, dark, soft=False):
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w - 1, h - 1), fill=OUTLINE)
    d.rectangle((1, 1, w - 2, h - 2), fill=rgba(dark))
    d.rectangle((1, 1, w - 3, h - 3), fill=rgba(light))
    d.rectangle((2, 2, w - 3, h - 3), fill=rgba(fill))
    if soft:  # knock off the outer corners for a chunkier frame
        for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
            img.putpixel((x, y), (0, 0, 0, 0))
    return img


def make_ui():
    UI_DIR.mkdir(parents=True, exist_ok=True)
    bevel_box((12, 12), (232, 217, 181), (252, 244, 222), (178, 152, 116), True).save(UI_DIR / "panel.png")
    bevel_box((12, 12), (46, 48, 64), (86, 90, 116), (24, 24, 34), True).save(UI_DIR / "panel_dark.png")
    bevel_box((12, 12), (150, 74, 52), (196, 116, 84), (90, 44, 32), True).save(UI_DIR / "banner.png")
    bevel_box((22, 22), (84, 76, 70), (52, 46, 44), (120, 110, 100)).save(UI_DIR / "slot.png")
    bevel_box((22, 22), (120, 104, 72), (250, 220, 120), (200, 150, 60)).save(UI_DIR / "slot_selected.png")
    bevel_box((11, 11), (240, 236, 224), (255, 255, 255), (160, 150, 140), True).save(UI_DIR / "key.png")
    bubble = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bubble)
    bd.rounded_rectangle((0, 0, 11, 11), 3, fill=OUTLINE)
    bd.rounded_rectangle((1, 1, 10, 10), 2, fill=(255, 252, 240, 255))
    bubble.save(UI_DIR / "bubble.png")
    tail = Image.new("RGBA", (7, 5), (0, 0, 0, 0))
    td = ImageDraw.Draw(tail)
    td.polygon([(0, 0), (6, 0), (3, 4)], fill=OUTLINE)
    td.polygon([(1, 0), (5, 0), (3, 2)], fill=(255, 252, 240, 255))
    tail.save(UI_DIR / "bubble_tail.png")
    arrow = Image.new("RGBA", (9, 8), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arrow)
    ad.polygon([(0, 0), (8, 0), (4, 6)], fill=OUTLINE)
    ad.polygon([(2, 1), (6, 1), (4, 4)], fill=(250, 220, 90, 255))
    arrow.save(UI_DIR / "arrow.png")


def make_items():
    """16x16 outlined inventory icons."""
    items = UI_DIR / "items"
    items.mkdir(parents=True, exist_ok=True)
    box = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(box)
    d.rectangle((5, 3, 10, 5), fill=(120, 120, 130, 255))          # handle
    d.rectangle((6, 4, 9, 5), fill=(0, 0, 0, 0))
    d.rectangle((2, 6, 13, 13), fill=(214, 72, 58, 255))
    d.rectangle((2, 6, 13, 7), fill=(240, 120, 100, 255))
    d.rectangle((2, 9, 13, 9), fill=(150, 44, 36, 255))
    d.rectangle((7, 8, 8, 10), fill=(230, 200, 90, 255))
    outline(box).save(items / "toolbox.png")
    card = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rectangle((2, 4, 13, 12), fill=(82, 132, 214, 255))
    d.rectangle((2, 4, 13, 5), fill=(140, 180, 240, 255))
    d.rectangle((4, 7, 7, 10), fill=(232, 200, 90, 255))
    d.rectangle((9, 8, 12, 8), fill=(220, 230, 250, 255))
    d.rectangle((9, 10, 11, 10), fill=(220, 230, 250, 255))
    outline(card).save(items / "keycard.png")


def _icon(size, pixels, palette):
    """pixels: rows of chars mapped through palette (space = transparent); outlined afterwards."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    for y, row in enumerate(pixels):
        for x, ch in enumerate(row):
            if ch != " " and ch in palette:
                img.putpixel((x + (size[0] - len(row)) // 2, y + (size[1] - len(pixels)) // 2), rgba(palette[ch]))
    return outline(img)


def make_icons():
    """Stat icons (11x11), extra item icons (16x16), markers, glow and door frames."""
    icons = UI_DIR / "icons"
    items = UI_DIR / "items"
    icons.mkdir(parents=True, exist_ok=True)
    _icon((11, 11), [" rr rr ", "rrwrrrr", "rrrrrrr", "rrrrrrr", " rrrrr ", "  rrr  ", "   r   "],
          {"r": (226, 72, 72), "w": (255, 200, 200)}).save(icons / "health.png")
    _icon((11, 11), ["   yy", "  yy ", " yyy ", "yyyyy", "  yy ", " yy  ", " y   "],
          {"y": (250, 206, 70)}).save(icons / "energy.png")
    _icon((11, 11), ["  ggg ", " gwggg", "gggggg", "gggggg", " gggg ", "  bb  ", "  bb  "],
          {"g": (236, 120, 60), "w": (255, 200, 150), "b": (240, 230, 210)}).save(icons / "food.png")
    _icon((9, 13), ["yyy", "yyy", "yyy", "yyy", "yyy", "   ", "yyy", "yyy"],
          {"y": (250, 214, 80)}).save(icons / "exclaim.png")
    _icon((11, 11), [" ggg ", "g   g", "g   g", "ggggg", "gg gg", "gg gg", "ggggg"],
          {"g": (226, 96, 80)}).save(icons / "lock.png")
    _icon((16, 16), ["  s s ", "   s  ", "cccccc ", "cwccccc", "ccccc c", "ccccccc", " cccc  "],
          {"c": (150, 96, 64), "w": (220, 180, 140), "s": (230, 230, 230)}).save(items / "coffee.png")
    _icon((16, 16), ["  gg rr  ", " ggggrrr ", "wwwwwwwww", "wyyyyyyyw", " wwwwwww "],
          {"g": (96, 180, 90), "r": (220, 90, 70), "w": (240, 236, 224), "y": (230, 190, 90)}).save(items / "meal.png")
    _icon((16, 16), ["  wwww  ", "wwwwwwww", "www rwww", "ww rrrww", "www rwww", "wwwwwwww"],
          {"w": (240, 240, 236), "r": (220, 70, 70)}).save(items / "medkit.png")
    _icon((16, 16), [" bbbb ", " bwbb ", " bbbb ", "  bb  ", "  bb  ", " gggg "],
          {"b": (120, 190, 240), "w": (220, 240, 255), "g": (150, 150, 160)}).save(items / "water.png")
    _icon((16, 16), ["  zzz", "    z", "   z ", "  zzz", "z    ", "zzz  "],
          {"z": (180, 200, 255)}).save(items / "sleep.png")
    for name, rows, pal in [
            ("health_s", ["r r", "rrr", " r "], {"r": (226, 72, 72)}),
            ("energy_s", [" y", "yy", "y "], {"y": (250, 206, 70)}),
            ("food_s", ["gg", "gg", " b"], {"g": (236, 120, 60), "b": (240, 230, 210)})]:
        _icon((7, 7), rows, pal).save(icons / f"{name}.png")
    glow = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    for y in range(64):
        for x in range(64):
            dist = ((x - 31.5) ** 2 + (y - 31.5) ** 2) ** 0.5 / 32.0
            a = max(0.0, 1.0 - dist) ** 1.6
            glow.putpixel((x, y), (255, 255, 255, int(a * 255)))
    glow.save(UI_DIR / "light.png")
    door = Image.new("RGBA", (8, 8), (0, 0, 0, 0))
    dd = ImageDraw.Draw(door)
    dd.rectangle((0, 0, 7, 7), fill=OUTLINE)
    dd.rectangle((1, 1, 6, 6), fill=(150, 160, 170, 255))
    dd.rectangle((1, 1, 6, 2), fill=(196, 204, 212, 255))
    dd.rectangle((1, 5, 6, 6), fill=(110, 118, 128, 255))
    door.save(UI_DIR / "door.png")
    bevel_box((9, 9), (40, 36, 48), (90, 86, 100), (20, 18, 26), True).save(UI_DIR / "badge.png")


def main():
    CREW_DIR.mkdir(parents=True, exist_ok=True)
    for name, c in CREW.items():
        make_sheet(c).save(CREW_DIR / f"{name}.png")
        make_portrait(c).save(CREW_DIR / f"{name}_portrait.png")
        make_frame(c, "down", 0).crop((2, 0, 18, 16)).save(CREW_DIR / f"{name}_icon.png")  # 16x16 head, 1:1 pixels
    make_ui()
    make_items()
    make_icons()
    print("Crew sheets, portraits and UI frames written")


if __name__ == "__main__":
    main()
