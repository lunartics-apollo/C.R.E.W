"""Draws assets/space_center.png: the C.R.E.W. ground station on Earth.

The layout (rooms, doors, furniture, tasks, vents) comes from data/station_layout.json, the
same file the game loads for collision, so the art and the walkable areas always match.

Run from the project root:  python scripts/make_world.py
"""
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw
from interior_art import export_furniture

ROOT = Path(__file__).resolve().parent.parent
LAYOUT = json.loads((ROOT / "data" / "station_layout.json").read_text(encoding="utf-8"))
W, H = LAYOUT["size"]
WALL = LAYOUT["wall"]
FACE = LAYOUT["face"]
OUT = ROOT / "assets" / "space_center.png"
SIGN_SPANS = []   # (x1, x2, face_top) of every room sign, so posters can avoid them

random.seed(42)
im = Image.new("RGB", (W, H), "#5f9450")
d = ImageDraw.Draw(im)

OUTLINE = "#2b2524"
WALL_TOP = "#17131c"       # solid dark wall tops, rooms read as cut-outs
WALL_FACE = "#d8cdb8"
WALL_FACE_DARK = "#b7aa93"
TRIM = "#6e5b4d"


def box(r):
    x, y, w, h = r
    return x, y, x + w - 1, y + h - 1


def rect(x1, y1, x2, y2, fill, outline=None):
    d.rectangle((x1, y1, x2, y2), fill=fill, outline=outline)


def shade(hex_color, k):
    """Lighten (k > 0) or darken (k < 0) a #rrggbb colour."""
    c = [int(hex_color[i:i + 2], 16) for i in (1, 3, 5)]
    c = [max(0, min(255, int(v + (255 - v) * k if k > 0 else v * (1 + k)))) for v in c]
    return "#%02x%02x%02x" % tuple(c)


def text(x, y, s, fill="#fff0c9"):
    d.text((x, y), s, fill=fill)


def hazard(x1, y1, x2, y2):
    rect(x1, y1, x2, y2, "#e6c84f")
    for sx in range(x1 - 10, x2 + 10, 10):
        d.polygon([(sx, y2), (sx + 5, y2), (sx + 9, y1), (sx + 4, y1)], fill="#2b2524")


# ── Earth: grass, paths, parking, fence ──────────────────────────────────────
def draw_lawn(fx, fy, fw, fh):
    rect(0, 0, W, H, "#4f8244")                       # wild grass beyond the fence
    rect(fx, fy, fx + fw, fy + fh, "#6aa25a")         # mown lawn inside
    for _ in range(5200):                             # grass texture
        x, y = random.randrange(W), random.randrange(H)
        inside = fx < x < fx + fw and fy < y < fy + fh
        col = random.choice(["#7cb468", "#5d9150", "#74ad61"] if inside else ["#5b9150", "#447539"])
        d.point((x, y), fill=col)
        if random.random() < 0.25:
            d.point((x, y - 1), fill=col)
    for _ in range(140):                              # wildflowers
        x, y = random.randrange(fx, fx + fw), random.randrange(fy, fy + fh)
        d.point((x, y), fill=random.choice(["#f2e3a0", "#f0a7a0", "#ffffff", "#b9a8e6"]))
        d.point((x + 1, y), fill="#3e6b34")


def draw_paths():
    g = LAYOUT["grounds"]
    road = g["road_y"]
    rect(0, road + 2, W, H, "#4a4a4f")                   # road beyond the south fence
    for x in range(0, W, 40):
        rect(x, road + 20, x + 20, road + 23, "#e9dfa6")
    rect(0, road, W, road + 2, "#8f8a80")
    for x, y, w, h in g["paths"]:
        rect(x, y, x + w, y + h, "#c9b48a")
        for _ in range(w * h // 40):
            d.point((random.randint(x, x + w), random.randint(y, y + h)), fill=random.choice(["#b9a47a", "#d6c39b"]))
    px1, py1, px2, py2 = g["parking"]
    rect(px1, py1, px2, py2, "#6d6c6f")
    for x in range(px1 + 10, px2, 60):
        rect(x, py1 + 4, x + 1, py1 + 40, "#e9e2cf")
    ax1, ay1, ax2, ay2 = g["apron"]
    rect(ax1, ay1, ax2, ay2, "#b9b4a8")
    for x in range(ax1, ax2, 24):
        d.line((x, ay1, x, ay2), fill="#a7a296")
    for y in range(ay1, ay2, 24):
        d.line((ax1, y, ax2, y), fill="#a7a296")
    hazard(ax1, ay1 - 4, ax2, ay1 + 2)
    hazard(ax1, ay2 - 2, ax2, ay2 + 4)


def draw_fence(fx, fy, fw, fh):
    rect(fx, fy, fx + fw, fy + fh, None, "#9aa0a0")
    rect(fx + 1, fy + 1, fx + fw - 1, fy + fh - 1, None, "#6f7575")
    for x in range(fx, fx + fw + 1, 24):
        rect(x - 1, fy - 2, x + 1, fy + 2, "#d0d4d2")
        rect(x - 1, fy + fh - 2, x + 1, fy + fh + 2, "#d0d4d2")
    for y in range(fy, fy + fh + 1, 24):
        rect(fx - 2, y - 1, fx + 2, y + 1, "#d0d4d2")
        rect(fx + fw - 2, y - 1, fx + fw + 2, y + 1, "#d0d4d2")
    gx1, gx2 = LAYOUT["grounds"]["gate"]
    rect(gx1, fy + fh - 3, gx2, fy + fh + 3, "#c9b48a")  # front gate
    rect(gx1 - 4, fy + fh - 6, gx1 - 1, fy + fh + 6, "#e0a458")
    rect(gx2 + 1, fy + fh - 6, gx2 + 4, fy + fh + 6, "#e0a458")


def draw_tree(x, y):
    d.ellipse((x - 14, y - 6, x + 16, y + 4), fill="#3f6a36")          # shadow
    rect(x - 2, y - 10, x + 2, y, "#6b4a33")                           # trunk
    for dx, dy, r, c in [(0, -22, 15, "#2f5e2c"), (-6, -26, 10, "#3f7a37"), (5, -28, 9, "#4f8f43"), (-2, -31, 6, "#64a653")]:
        d.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=c)


# ── the building ─────────────────────────────────────────────────────────────
def floor_pattern(room_id, r, base):
    x1, y1, x2, y2 = r
    rect(x1, y1, x2, y2, base)
    if room_id in ("medbay", "lab", "life_support"):           # tiles
        for ty in range(y1, y2, 16):
            for tx in range(x1, x2, 16):
                if ((tx - x1) // 16 + (ty - y1) // 16) % 2:
                    rect(tx, ty, min(tx + 15, x2), min(ty + 15, y2), shade(base, -0.06))
        for tx in range(x1, x2, 16):
            d.line((tx, y1, tx, y2), fill=shade(base, -0.14))
    elif room_id in ("quarters", "mess_hall"):                 # wood planks
        grain = random.Random(x1 + y1)
        for row, ty in enumerate(range(y1, y2, 12)):
            off = 0 if row % 2 else 40
            for tx in range(x1 - off, x2, 80):
                left, right, bottom = max(x1, tx), min(x2, tx + 79), min(y2, ty + 11)
                wood = shade(base, grain.choice([-0.05, -0.02, 0.02, 0.05]))
                rect(left, ty, right, bottom, wood)
                d.line((left, bottom, right, bottom), fill=shade(base, -0.24))
                d.line((left, ty, left, bottom), fill=shade(base, -0.19))
                d.line((left + 1, ty + 1, right, ty + 1), fill=shade(wood, 0.15))
                for _ in range(3):
                    gx, gy = grain.randint(left, max(left, right - 8)), grain.randint(ty + 3, ty + 8)
                    d.line((gx, gy, min(gx + grain.randint(5, 24), right), gy), fill=shade(wood, -0.09))
    elif room_id in ("storage", "corridor"):                   # sealed concrete
        for _ in range((x2 - x1) * (y2 - y1) // 60):
            d.point((random.randint(x1, x2), random.randint(y1, y2)), fill=shade(base, random.choice([-0.06, 0.05])))
        for ty in range(y1, y2, 32):
            d.line((x1, ty, x2, ty), fill=shade(base, -0.1))
    else:                                                      # metal deck plates
        for ty in range(y1, y2, 24):
            for tx in range(x1, x2, 24):
                rect(tx, ty, min(tx + 23, x2), min(ty + 23, y2), None, shade(base, -0.15))
                d.point((tx + 2, ty + 2), fill=shade(base, 0.25))
                d.point((tx + 21, ty + 21), fill=shade(base, 0.25))
    rect(x1, y1, x2, y1 + 4, shade(base, -0.25))              # shadow under the wall face
    # Thin material highlights and ambient occlusion where the floor meets walls.
    glazing = ImageDraw.Draw(im, "RGBA")
    for inset, alpha in enumerate([38, 27, 18, 11, 6]):
        glazing.rectangle((x1 + inset, y1 + inset, x2 - inset, y2 - inset), outline=(17, 29, 31, alpha))
    if room_id in ("medbay", "lab", "life_support"):
        for ty in range(y1 + 1, y2 - 1, 16):
            for tx in range(x1 + 1, x2 - 1, 16):
                d.line((tx, ty, min(tx + 13, x2 - 1), ty), fill=shade(base, 0.14))
                d.line((tx, ty, tx, min(ty + 13, y2 - 1)), fill=shade(base, 0.10))


def draw_face(room, exterior_top):
    x1, y1, x2, _ = box(room["rect"])
    fy2 = y1 + FACE - 1
    rect(x1, y1, x2, fy2, WALL_FACE)
    rect(x1, y1, x2, y1 + 2, "#efe6d4")
    rect(x1, fy2 - 3, x2, fy2, TRIM)
    for yy in range(y1 + 4, fy2 - 3):
        rect(x1 + 1, yy, x2 - 1, yy, shade(WALL_FACE, -0.12 * (yy - y1) / FACE))
    rect(x1 + 1, fy2 - 5, x2 - 1, fy2 - 4, "#e2d9be")
    rect(x1 + 1, fy2 - 2, x2 - 1, fy2, "#655c51")
    for px in range(x1 + 30, x2 - 10, 40):
        d.line((px, y1 + 3, px, fy2 - 4), fill=WALL_FACE_DARK)
    if exterior_top:                                       # windows onto a blue Earth sky
        for wx in range(x1 + 14, x2 - 30, 64):
            rect(wx, y1 + 5, wx + 24, y1 + 19, "#5b4b44")
            rect(wx + 2, y1 + 7, wx + 22, y1 + 17, "#8fc6e8")
            d.ellipse((wx + 4, y1 + 9, wx + 13, y1 + 13), fill="#f4fbff")
            rect(wx + 2, y1 + 15, wx + 22, y1 + 17, "#76b061")
            d.line((wx + 12, y1 + 7, wx + 12, y1 + 17), fill="#e9e4cc")
            rect(wx - 1, y1 + 20, wx + 25, y1 + 22, "#8e897a")
            rect(wx - 2, y1 + 19, wx + 26, y1 + 20, "#ede4ca")
            light = ImageDraw.Draw(im, "RGBA")
            light.polygon([(wx, y1 + FACE + 4), (wx + 24, y1 + FACE + 4),
                           (wx + 65, y1 + FACE + 74), (wx + 21, y1 + FACE + 74)], fill=(255, 231, 171, 22))


def draw_sign(room):
    """Room name plate on the wall face, nudged sideways so it never covers a doorway."""
    x1, y1, x2, _ = box(room["rect"])
    name = room["name"]
    tw = len(name) * 6 + 10
    blocked = [(dx - 4, dx + dw + 4) for dx, dy, dw, dh in (dr["rect"] for dr in LAYOUT["doors"])
               if dy <= y1 + 18 and dy + dh >= y1 and dx < x2 and dx + dw > x1]
    for cx in ((x1 + x2) // 2, x1 + tw // 2 + 8, x2 - tw // 2 - 8):
        if all(cx + tw // 2 < a or cx - tw // 2 > b for a, b in blocked):
            break
    rect(cx - tw // 2, y1 + 6, cx + tw // 2, y1 + 18, "#2f3436", room.get("accent", "#e8c07d"))
    text(cx - tw // 2 + 5, y1 + 7, name)
    SIGN_SPANS.append((cx - tw // 2, cx + tw // 2, y1))


def door_is_side(door):
    """True when the doorway cuts through a vertical wall (you walk east-west through it)."""
    x, y, w, h = door["rect"]
    cx = x + w / 2
    for rid in door["between"]:
        room = LAYOUT["rooms"].get(rid)
        if room:
            rx, _, rw, _ = room["rect"]
            return cx < rx or cx > rx + rw
    return w > h


def draw_door(door):
    x1, y1, x2, y2 = box(door["rect"])
    a, b = door["between"]
    room = LAYOUT["rooms"].get(b if b != "outside" else a)
    base = shade(room["floor"], -0.04) if room else "#8d877c"
    rect(x1, y1, x2, y2, base)
    if door_is_side(door):                                 # walking east/west: jambs top and bottom
        rect(x1, y1 - 3, x2, y1 - 1, "#9aa0a0")
        rect(x1, y2 + 1, x2, y2 + 3, "#9aa0a0")
        for xx in range(x1 + 2, x2, 6):
            d.line((xx, y1, xx, y2), fill=shade(base, -0.08))
    else:                                                  # walking north/south: jambs left and right
        rect(x1 - 3, y1, x1 - 1, y2, "#9aa0a0")
        rect(x2 + 1, y1, x2 + 3, y2, "#9aa0a0")
        for yy in range(y1 + 2, y2, 6):
            d.line((x1, yy, x2, yy), fill=shade(base, -0.08))
    if "outside" in door["between"]:
        rect(x1, y1, x2, y2, None, "#e6c84f")


def draw_building():
    rooms = LAYOUT["rooms"]
    outers = []
    for room in rooms.values():
        x, y, w, h = room["rect"]
        outers.append((x - WALL, y - WALL, x + w + WALL - 1, y + h + WALL - 1))
    for x1, y1, x2, y2 in outers:                         # drop shadow on the lawn
        rect(x1 + 6, y1 + 8, x2 + 6, y2 + 8, "#4a7a3f")
    for x1, y1, x2, y2 in outers:
        rect(x1, y1, x2, y2, WALL_TOP)
    top_row = min(r["rect"][1] for r in rooms.values())
    for room_id, room in rooms.items():
        x1, y1, x2, y2 = box(room["rect"])
        floor_pattern(room_id, (x1, y1 + FACE, x2, y2), room["floor"])
        draw_face(room, room["rect"][1] == top_row)
    for door in LAYOUT["doors"]:
        draw_door(door)
    for room in rooms.values():
        draw_sign(room)
    for x1, y1, x2, y2 in outers:                         # thick dark outline around the building
        rect(x1 - 2, y1 - 2, x2 + 2, y2 + 2, None, OUTLINE)
        rect(x1 - 1, y1 - 1, x2 + 1, y2 + 1, None, OUTLINE)


# ── furniture ────────────────────────────────────────────────────────────────
def screen(x1, y1, x2, y2, glow="#7cc5d9"):
    rect(x1, y1, x2, y2, "#1f2426", OUTLINE)
    rect(x1 + 2, y1 + 2, x2 - 2, y2 - 2, glow)
    for yy in range(y1 + 4, y2 - 2, 3):
        d.line((x1 + 3, yy, x2 - 3, yy), fill=shade(glow, -0.25))


def draw_meeting_table(x1, y1, x2, y2):
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    d.ellipse((x1 - 6, y1 - 2, x2 + 6, y2 + 6), fill="#5a4238")
    d.ellipse((x1 - 8, y1 - 6, x2 + 8, y2 + 2), fill="#a8774f", outline=OUTLINE)
    d.ellipse((x1 - 2, y1 - 2, x2 + 2, y2 - 2), fill="#b98a5f")
    d.ellipse((cx - 9, cy - 9, cx + 9, cy + 5), fill="#6d6c6f", outline=OUTLINE)
    d.ellipse((cx - 6, cy - 7, cx + 6, cy + 2), fill="#d9483b", outline="#f0a7a0")
    for sx, sy in [(x1 - 22, cy - 6), (x2 + 10, cy - 6), (cx - 6, y1 - 22), (cx - 6, y2 + 8)]:
        rect(sx, sy, sx + 12, sy + 10, "#3d5a73", OUTLINE)


def draw_bunk(x1, y1, x2, y2):
    rect(x1, y1, x2, y2, "#6b4a33", OUTLINE)
    rect(x1 + 3, y1 + 3, x2 - 3, y1 + 30, "#d6d0c4")
    rect(x1 + 3, y1 + 34, x2 - 3, y2 - 3, "#d6d0c4")
    rect(x1 + 3, y1 + 14, x2 - 3, y1 + 30, "#5f7fb3")
    rect(x1 + 3, y1 + 46, x2 - 3, y2 - 3, "#b35f5f")


def draw_launch_pad(x1, y1, x2, y2):
    rect(x1 - 10, y1 - 6, x2 + 10, y2 + 10, "#8a857a", OUTLINE)
    rect(x1 + 8, y2 + 2, x2 - 8, y2 + 10, "#2b2524")     # flame trench
    rect(x2 + 4, y1 - 70, x2 + 9, y2, "#c9653f")          # service tower
    for yy in range(y1 - 66, y2, 10):
        d.line((x2 + 4, yy, x2 + 9, yy + 6), fill="#f0c68c")


def draw_car(x1, y1, x2, y2):
    body = random.choice(["#c9653f", "#4a7fd9", "#e9e2cf"])
    rect(x1 + 2, y1 + 3, x2 + 2, y2 + 3, "#4d4c4f")
    d.rounded_rectangle((x1, y1, x2, y2), 5, fill=body, outline=OUTLINE)
    rect(x1 + 9, y1 + 3, x2 - 9, y2 - 3, "#9fc9d9")
    rect(x1 + 13, y1 + 3, x2 - 13, y2 - 3, body)


def draw_small_furniture(kind, x1, y1, x2, y2):
    if kind == "console":
        rect(x1, y1, x2, y2, "#4b4f52", OUTLINE)
        for i, gx in enumerate(range(x1 + 4, x2 - 20, 30)):
            screen(gx, y1 + 2, gx + 24, y1 + 14, ["#7cc5d9", "#8fd694", "#f0c68c", "#7cc5d9"][i % 4])
        for lx in range(x1 + 6, x2 - 4, 7):
            d.point((lx, y2 - 4), fill=random.choice(["#e5604d", "#8fd694", "#e6c84f"]))
    elif kind == "monitor_desk":
        rect(x1, y1, x2, y2, "#5a4a40", OUTLINE)
        for gx in range(x1 + 4, x2 - 16, 22):
            screen(gx, y1 - 4, gx + 18, y1 + 10, "#9fb7c9")
    elif kind == "server_rack":
        rect(x1, y1, x2, y2, "#2d3133", OUTLINE)
        for yy in range(y1 + 3, y2 - 2, 6):
            rect(x1 + 3, yy, x2 - 3, yy + 3, "#454a4d")
            d.point((x2 - 6, yy + 1), fill=random.choice(["#8fd694", "#e6c84f", "#7cc5d9"]))
    elif kind == "generator":
        rect(x1, y1, x2, y2, "#7a7568", OUTLINE)
        rect(x1 + 4, y1 + 4, x2 - 4, y2 - 4, "#e6c84f")
        for xx in range(x1 + 8, x2 - 6, 6):
            d.line((xx, y1 + 6, xx, y2 - 6), fill="#8c7b2f")
    elif kind == "crates":
        for cx in range(x1, x2, 22):
            for cy in range(y1, y2, 20):
                rect(cx, cy, min(cx + 20, x2), min(cy + 18, y2), "#b0814f", OUTLINE)
                d.line((cx, cy, min(cx + 20, x2), min(cy + 18, y2)), fill="#8a6239")
    elif kind == "tanks":
        for cx in range(x1, x2, 22):
            d.ellipse((cx, y1, cx + 20, y2), fill="#7cb3c4", outline=OUTLINE)
            d.ellipse((cx + 4, y1 + 4, cx + 10, y1 + 14), fill="#bfe1ea")
    elif kind == "med_bed":
        rect(x1, y1, x2, y2, "#e9eef0", OUTLINE)
        rect(x1 + 2, y1 + 2, x1 + 10, y2 - 2, "#ffffff")
        rect(x1 + 12, y1 + 2, x2 - 2, y2 - 2, "#9fd1c2")


def draw_more_furniture(kind, x1, y1, x2, y2):
    if kind == "dining_table":
        rect(x1 - 2, y1 - 8, x2 + 2, y1 - 3, OUTLINE)                  # bench behind
        rect(x1 - 1, y1 - 7, x2 + 1, y1 - 4, "#7a5238")
        rect(x1 - 2, y2 + 3, x2 + 2, y2 + 8, OUTLINE)                  # bench in front
        rect(x1 - 1, y2 + 4, x2 + 1, y2 + 7, "#7a5238")
        rect(x1, y1, x2, y2, OUTLINE)
        rect(x1 + 1, y1 + 1, x2 - 1, y2 - 3, "#c9955f")
        rect(x1 + 1, y2 - 2, x2 - 1, y2 - 1, "#8a6239")
        for i, tx in enumerate(range(x1 + 8, x2 - 6, 16)):
            d.ellipse((tx - 4, y1 + 5, tx + 4, y1 + 11), fill="#f0f0e8", outline=OUTLINE)
            d.point((tx, y1 + 8), fill=["#e5604d", "#8fd694", "#f2c94c"][i % 3])
    elif kind == "vending":
        rect(x1, y1 - 18, x2, y2, OUTLINE)
        rect(x1 + 1, y1 - 17, x2 - 1, y2 - 1, "#d9483b")
        rect(x1 + 3, y1 - 15, x2 - 8, y2 - 4, "#9fd8f0")
        for yy in range(y1 - 13, y2 - 5, 4):
            rect(x1 + 4, yy, x2 - 9, yy + 1, random.choice(["#f2c94c", "#8fd694", "#e8843e"]))
        rect(x2 - 6, y1 - 12, x2 - 3, y1 - 6, "#2b2524")
    elif kind == "desk":
        rect(x1, y1, x2, y2, OUTLINE)
        rect(x1 + 1, y1 + 1, x2 - 1, y2 - 3, "#a8774f")
        rect(x1 + 1, y2 - 2, x2 - 1, y2 - 1, "#6b4a33")
        screen(x1 + 4, y1 - 9, x1 + 18, y1 + 3, "#9fd8e8")
        rect(x1 + 22, y1 + 5, x1 + 32, y1 + 8, "#3a3446")               # keyboard
        d.ellipse((x2 - 12, y2 + 2, x2 - 2, y2 + 10), fill="#3d5a73", outline=OUTLINE)   # chair
    elif kind == "locker":
        for lx in range(x1, x2 - 6, 14):
            rect(lx, y1 - 12, lx + 13, y2, OUTLINE)
            rect(lx + 1, y1 - 11, lx + 12, y2 - 1, "#6d8aa6")
            rect(lx + 1, y1 - 11, lx + 12, y1 - 9, "#8fa9c2")
            for yy in (y1 - 6, y1 - 3):
                rect(lx + 3, yy, lx + 10, yy, "#3f566e")
            d.point((lx + 10, y1 + 2), fill="#f2c94c")
    elif kind == "shelf":
        rect(x1, y1 - 10, x2, y2, OUTLINE)
        rect(x1 + 1, y1 - 9, x2 - 1, y2 - 1, "#8a6239")
        for yy in (y1 - 3, y2 - 3):
            rect(x1 + 1, yy, x2 - 1, yy, "#5a3e24")
        for bx in range(x1 + 3, x2 - 6, 9):
            c = random.choice(["#4a7fd9", "#e5604d", "#f2c94c", "#8fd694", "#e9e2cf"])
            rect(bx, y1 - 8, bx + 6, y1 - 4, c)
            rect(bx + 2, y2 - 8, bx + 7, y2 - 4, random.choice(["#b0814f", "#9fd8e8", "#d6d0c4"]))
    elif kind == "satellite":
        rect(x1 + 14, y1 + 6, x2 - 14, y2 - 4, OUTLINE)
        rect(x1 + 15, y1 + 7, x2 - 15, y2 - 5, "#e6c046")
        for sx in (x1, x2 - 13):
            rect(sx, y1 + 10, sx + 13, y2 - 8, OUTLINE)
            rect(sx + 1, y1 + 11, sx + 12, y2 - 9, "#4a7fd9")
            for gx in range(sx + 3, sx + 12, 3):
                d.line((gx, y1 + 11, gx, y2 - 9), fill="#9fc3ff")
        d.ellipse(((x1 + x2) // 2 - 4, y1 - 2, (x1 + x2) // 2 + 4, y1 + 6), fill="#d0d4d2", outline=OUTLINE)
        rect(x1 + 6, y2 - 2, x2 - 6, y2, "#5a5a60")
    elif kind == "table":
        rect(x1, y1, x2, y2, OUTLINE)
        rect(x1 + 1, y1 + 1, x2 - 1, y2 - 3, "#9aa0a0")
        rect(x1 + 1, y2 - 2, x2 - 1, y2 - 1, "#6f7575")
        rect(x1 + 6, y1 + 4, x1 + 16, y1 + 10, "#e6c046")
        rect(x2 - 16, y1 + 5, x2 - 6, y1 + 9, "#4a7fd9")
    elif kind == "pipes":
        for i, yy in enumerate(range(y1, y2, 5)):
            rect(x1, yy, x2, yy + 4, OUTLINE)
            rect(x1 + 1, yy + 1, x2 - 1, yy + 3, ["#8fa9c2", "#c9653f", "#8fd694"][i % 3])
        for vx in range(x1 + 10, x2 - 4, 30):
            d.ellipse((vx - 3, y1 - 3, vx + 3, y1 + 3), fill="#e5604d", outline=OUTLINE)
    else:
        return False
    return True


BIG_FURNITURE = {"meeting_table": draw_meeting_table, "bunk": draw_bunk,
                 "launch_pad": draw_launch_pad, "car": draw_car}


def draw_obstacle(o):
    kind = o["kind"]
    if kind in BIG_FURNITURE:
        BIG_FURNITURE[kind](*box(o["rect"]))
    elif draw_more_furniture(kind, *box(o["rect"])):
        pass
    else:
        draw_small_furniture(kind, *box(o["rect"]))


# ── decor, lamps and special use-spots ───────────────────────────────────────
def draw_plant(x, y):
    d.ellipse((x - 6, y - 2, x + 6, y + 2), fill="#3a3030")
    rect(x - 4, y - 7, x + 4, y, OUTLINE)
    rect(x - 3, y - 6, x + 3, y - 1, "#b0623f")
    for dx, dy, r, c in [(0, -12, 6, "#2f6b34"), (-3, -14, 4, "#3f8a40"), (3, -15, 4, "#4fa04c"), (0, -17, 3, "#6cbc5c")]:
        d.ellipse((x + dx - r - 1, y + dy - r - 1, x + dx + r + 1, y + dy + r + 1), fill=OUTLINE)
    for dx, dy, r, c in [(0, -12, 6, "#2f6b34"), (-3, -14, 4, "#3f8a40"), (3, -15, 4, "#4fa04c"), (0, -17, 3, "#6cbc5c")]:
        d.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=c)


def draw_rug(x, y, w, h, color):
    rect(x - w // 2, y - h // 2, x + w // 2, y + h // 2, OUTLINE)
    rect(x - w // 2 + 1, y - h // 2 + 1, x + w // 2 - 1, y + h // 2 - 1, color)
    rect(x - w // 2 + 4, y - h // 2 + 4, x + w // 2 - 4, y + h // 2 - 4, None, shade(color, 0.3))
    for xx in range(x - w // 2 + 2, x + w // 2 - 1, 3):
        d.point((xx, y - h // 2 - 1), fill=shade(color, 0.2))
        d.point((xx, y + h // 2 + 1), fill=shade(color, 0.2))


def draw_lamp(x, y):
    d.ellipse((x - 5, y - 2, x + 5, y + 2), fill="#3f6a36")
    rect(x - 1, y - 26, x + 1, y, OUTLINE)
    rect(x - 4, y - 31, x + 4, y - 25, OUTLINE)
    rect(x - 3, y - 30, x + 3, y - 27, "#fff1b8")


def draw_decor_item(item):
    x, y = item["pos"]
    kind = item["kind"]
    if kind == "plant":
        draw_plant(x, y)
    elif kind == "rug":
        draw_rug(x, y, item["size"][0], item["size"][1], item["color"])
    elif kind == "bin":
        rect(x - 4, y - 8, x + 4, y, OUTLINE)
        rect(x - 3, y - 7, x + 3, y - 1, "#7a8a90")
        rect(x - 3, y - 7, x + 3, y - 6, "#a8b8bc")
    elif kind == "board":                                  # notice board on a wall face
        rect(x, y, x + 34, y + 18, OUTLINE)
        rect(x + 1, y + 1, x + 33, y + 17, "#b0814f")
        for i, c in enumerate(["#fff4dc", "#f2c94c", "#9fd8e8", "#f0a7a0"]):
            rect(x + 3 + i * 8, y + 3 + (i % 2) * 3, x + 9 + i * 8, y + 11 + (i % 2) * 3, c)
    elif kind == "bench":
        rect(x - 12, y - 8, x + 12, y, OUTLINE)
        rect(x - 11, y - 7, x + 11, y - 4, "#a8774f")
        rect(x - 10, y - 3, x - 8, y - 1, "#5a4238")
        rect(x + 8, y - 3, x + 10, y - 1, "#5a4238")
    elif kind == "flowers":
        rect(x - 16, y - 5, x + 16, y + 5, OUTLINE)
        rect(x - 15, y - 4, x + 15, y + 4, "#6b4a33")
        for i in range(10):
            fx = x - 13 + i * 3
            fy = y - 2 + (i % 3)
            d.point((fx, fy), fill=random.choice(["#f2e3a0", "#f0a7a0", "#ffffff", "#e5604d"]))
            d.point((fx, fy + 1), fill="#4f8f43")
    elif kind == "flag":
        rect(x - 1, y - 40, x + 1, y, OUTLINE)
        rect(x + 2, y - 40, x + 16, y - 31, OUTLINE)
        rect(x + 3, y - 39, x + 15, y - 32, "#4a7fd9")
        rect(x + 3, y - 36, x + 15, y - 35, "#fff4dc")


def draw_posters():
    """A poster or two on the wall face of every interior room without windows."""
    top_row = min(r["rect"][1] for r in LAYOUT["rooms"].values())
    palette = [("#4a7fd9", "#fff4dc"), ("#e8843e", "#2b2524"), ("#5fb36a", "#fff4dc"), ("#e6c046", "#2b2524")]
    for i, (rid, room) in enumerate(LAYOUT["rooms"].items()):
        x, y, w, _ = room["rect"]
        if y == top_row or rid == "corridor":
            continue
        for k, px in enumerate((x + w - 40, x + 14)):
            if any(dx - 6 < px + 16 and dx + dw + 6 > px for dx, dy, dw, dh in (dr["rect"] for dr in LAYOUT["doors"]) if dy < y + FACE and dy + dh > y):
                continue
            if any(sy == y and a - 4 < px + 16 and b + 4 > px for a, b, sy in SIGN_SPANS):
                continue
            bg, fg = palette[(i + k) % len(palette)]
            rect(px, y + 5, px + 14, y + 22, OUTLINE)
            rect(px + 1, y + 6, px + 13, y + 21, bg)
            d.ellipse((px + 4, y + 9, px + 10, y + 15), fill=fg)
            rect(px + 3, y + 17, px + 11, y + 18, fg)
            break


def draw_special_spot(sid, x, y):
    if sid == "coffee_machine":
        rect(x - 7, y - 20, x + 7, y - 4, OUTLINE)
        rect(x - 6, y - 19, x + 6, y - 5, "#4b4f52")
        rect(x - 4, y - 17, x + 4, y - 13, "#e5604d")
        rect(x - 2, y - 9, x + 2, y - 6, "#fff4dc")
    elif sid == "refill_water":
        rect(x - 5, y - 24, x + 5, y - 4, OUTLINE)
        rect(x - 4, y - 23, x + 4, y - 15, "#9fd8f0")
        rect(x - 4, y - 14, x + 4, y - 5, "#e9eef0")
        rect(x - 2, y - 21, x - 1, y - 17, "#e8f8ff")
    elif sid == "food_counter":
        rect(x - 16, y - 16, x + 16, y - 5, OUTLINE)
        rect(x - 15, y - 15, x + 15, y - 6, "#c9b48a")
        for i, c in enumerate(["#e5604d", "#8fd694", "#f2c94c"]):
            d.ellipse((x - 13 + i * 10, y - 14, x - 6 + i * 10, y - 9), fill=c, outline=OUTLINE)
    elif sid == "restock_medkits":
        rect(x - 8, y - 24, x + 8, y - 5, OUTLINE)
        rect(x - 7, y - 23, x + 7, y - 6, "#f0f2f0")
        rect(x - 1, y - 20, x + 1, y - 12, "#e5604d")
        rect(x - 4, y - 17, x + 4, y - 15, "#e5604d")
    else:
        return False
    return True


def draw_markers():
    x, y = LAYOUT["grounds"]["scan_pad"]                   # med scanner pad around the scan task
    d.ellipse((x - 14, y - 8, x + 14, y + 8), fill="#9fd1c2", outline="#5fb59b")
    d.ellipse((x - 12, y - 6, x + 12, y + 6), outline="#d2e9cb")
    rect(x - 6, y - 1, x + 6, y + 1, "#608d85")
    rect(x - 1, y - 4, x + 1, y + 4, "#608d85")
    for s in LAYOUT["spots"]:                              # interaction spots: small outlined consoles
        x, y = s["pos"]
        if s["room"] != "outside":
            continue  # rendered as depth-sorted fixtures by interior_art.py
        if s["id"] in ("bunk", "toolbox_shelf", "assemble_panels", "fuel_rocket", "health_scan"):
            continue  # drawn as furniture / props already
        if draw_special_spot(s["id"], x, y):
            continue
        rect(x - 7, y - 16, x + 7, y - 6, OUTLINE)
        rect(x - 6, y - 15, x + 6, y - 7, "#5b6670")
        rect(x - 4, y - 13, x + 4, y - 9, "#9fd8e8")
        d.point((x + 5, y - 8), fill="#e6c84f")


def main():
    fx, fy, fw, fh = LAYOUT["fence"]
    draw_lawn(fx, fy, fw, fh)
    draw_paths()
    draw_fence(fx, fy, fw, fh)
    draw_building()
    draw_posters()
    for item in LAYOUT.get("decor", []):
        if item["kind"] == "rug":
            draw_decor_item(item)
    count = export_furniture(LAYOUT, im, ROOT / "assets" / "interiors")
    for o in LAYOUT["obstacles"]:
        if o["kind"] in ("car", "launch_pad"):
            draw_obstacle(o)
    draw_markers()
    tall = [("tree", t) for t in LAYOUT["trees"]] + [("lamp", l) for l in LAYOUT.get("lamps", [])]
    tall += [("decor", i["pos"], i) for i in LAYOUT.get("decor", []) if i["kind"] != "rug"]
    for entry in sorted(tall, key=lambda e: e[1][1]):     # back-to-front so tall things overlap
        if entry[0] == "tree":
            draw_tree(*entry[1])
        elif entry[0] == "lamp":
            draw_lamp(*entry[1])
        else:
            draw_decor_item(entry[2])
    for lx, ly, label, colour in LAYOUT["grounds"]["labels"]:
        text(lx, ly, label, colour)
    OUT.parent.mkdir(exist_ok=True)
    im.save(OUT)
    print(f"Generated {OUT.relative_to(ROOT)} ({W}x{H})")
    print(f"Exported {count} raised interior props with matching floor anchors")


if __name__ == "__main__":
    main()
