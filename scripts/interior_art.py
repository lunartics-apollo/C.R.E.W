"""Raised, hand-drawn pixel furniture for the station's existing layout.

The footprint stays on the floor; artwork extends upwards. The exported anchor
is the footprint's front edge so Godot can sort it against the crew's feet.
"""
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw

INK = "#25333b"
METAL = "#647e87"
CREAM = "#e8dcc2"


def shade(color, amount):
    rgb = [int(color[i:i + 2], 16) for i in (1, 3, 5)]
    return "#%02x%02x%02x" % tuple(
        max(0, min(255, round(v + (255 - v) * amount if amount > 0 else v * (1 + amount))))
        for v in rgb)


class Furniture:
    def __init__(self, width, depth, seed):
        self.image = Image.new("RGBA", (width + 96, depth + 112))
        self.d = ImageDraw.Draw(self.image)
        self.x, self.y = 48, 64
        self.w, self.h = width, depth
        self.rng = random.Random(seed)

    def rect(self, bounds, fill, outline=None):
        self.d.rectangle(tuple(round(v) for v in bounds), fill=fill, outline=outline)

    def line(self, points, fill, width=1):
        self.d.line(tuple(round(v) for v in points), fill=fill, width=width)

    def ellipse(self, bounds, fill, outline=None):
        self.d.ellipse(tuple(round(v) for v in bounds), fill=fill, outline=outline)

    def body(self, x, y, w, h, color=METAL, height=10):
        # Front face, bevelled top, darker right edge and floor contact feet.
        self.rect((x, y - height, x + w - 1, y + h), shade(color, -0.33), INK)
        self.rect((x + 1, y - height + 1, x + w - 3, y + h - height), color)
        self.line((x + 1, y - height + 1, x + w - 3, y - height + 1), shade(color, 0.45))
        self.line((x + 1, y - height + 2, x + 1, y + h - height), shade(color, 0.20))
        self.rect((x + w - 3, y - height + 2, x + w - 1, y + h - 1), shade(color, -0.48))
        self.line((x + 2, y + h - height + 1, x + w - 4, y + h - height + 1), shade(color, 0.28))
        self.rect((x + 2, y + h - 1, x + 5, y + h + 2), INK)
        self.rect((x + w - 7, y + h - 1, x + w - 4, y + h + 2), INK)
        return y + h - height

    def wood(self, bounds, color="#b88b5e"):
        self.rect(bounds, color)
        x1, y1, x2, y2 = map(int, bounds)
        for yy in range(y1 + 3, y2, 5):
            self.line((x1 + 2, yy, x2 - 2, yy), shade(color, -0.12))
            if x2 - x1 > 15:
                xx = self.rng.randint(x1 + 3, x2 - 5)
                self.line((xx, yy + 1, min(xx + 8, x2 - 2), yy + 1), shade(color, 0.13))

    def display(self, x, y, w, h, color="#71d6c5", chart=True):
        self.rect((x, y, x + w, y + h), "#101e2c", "#9badb1")
        self.rect((x + 2, y + 2, x + w - 2, y + h - 2), "#193845")
        self.line((x + 2, y + 2, x + w - 2, y + 2), shade(color, -0.1))
        if chart and w >= 12 and h >= 9:
            for gy in range(y + 5, y + h - 1, 4):
                self.line((x + 3, gy, x + w - 3, gy), "#254a54")
            points = []
            for gx in range(x + 3, x + w - 2, 3):
                points.extend((gx, y + 4 + self.rng.randrange(max(1, h - 7))))
            if len(points) >= 4:
                self.line(points, color)
        self.line((x + 3, y + 3, x + min(w - 3, 8), y + 3), "#b3ede0")
        self.rect((x + w - 3, y + h + 1, x + w - 2, y + h + 1), color)

    def paper(self, x, y, color=CREAM):
        self.rect((x + 1, y + 1, x + 9, y + 7), "#3e5155")
        self.rect((x, y, x + 8, y + 6), color)
        self.line((x + 2, y + 2, x + 6, y + 2), "#748c8d")
        self.line((x + 2, y + 4, x + 5, y + 4), "#748c8d")

    def cup(self, x, y):
        self.ellipse((x - 3, y + 2, x + 4, y + 5), "#4b463b")
        self.rect((x - 2, y - 2, x + 2, y + 3), "#d5e2d8", INK)
        self.ellipse((x - 2, y - 3, x + 2, y), "#624b38", "#fff0d2")
        self.line((x + 3, y, x + 4, y + 2), "#d5e2d8")

    def chair(self, x, y, color="#52797f"):
        self.rect((x + 2, y + 8, x + 4, y + 14), INK)
        self.rect((x + 10, y + 8, x + 12, y + 14), INK)
        self.d.rounded_rectangle((x, y - 2, x + 14, y + 9), radius=3, fill=shade(color, -0.3), outline=INK)
        self.rect((x + 2, y, x + 12, y + 5), color)
        self.line((x + 3, y, x + 11, y), shade(color, 0.45))
        self.rect((x + 1, y - 6, x + 13, y - 3), shade(color, -0.1), INK)

    def draw(self, kind):
        x, y, w, h = self.x, self.y, self.w, self.h
        if kind == "meeting_table":
            cx, cy = x + w // 2, y + h // 2
            self.rect((cx - 4, cy + 6, cx + 4, y + h + 3), "#4f4840", INK)
            self.ellipse((x - 7, y - 5, x + w + 7, y + h + 3), "#69452f", INK)
            self.ellipse((x - 8, y - 12, x + w + 8, y + h - 5), "#c89a66", INK)
            # Wood grain is clipped to the rounded tabletop.
            mask = Image.new("L", self.image.size)
            ImageDraw.Draw(mask).ellipse((x - 5, y - 10, x + w + 5, y + h - 7), fill=255)
            grain = Image.new("RGBA", self.image.size)
            gd = ImageDraw.Draw(grain)
            for yy in range(y - 8, y + h - 6, 4):
                gd.line((x - 8, yy, x + w + 8, yy), fill="#b18554")
            grain.putalpha(Image.composite(grain.getchannel("A"), Image.new("L", grain.size), mask))
            self.image.alpha_composite(grain)
            self.d = ImageDraw.Draw(self.image)
            self.d.arc((x - 6, y - 10, x + w + 6, y + h - 7), 185, 330, fill="#f2cb8c", width=2)
            self.display(cx - 9, cy - 13, 18, 11, chart=False)
            self.paper(x + 7, cy + 3)
            self.cup(x + w - 10, cy + 4)
        elif kind == "chair":
            self.chair(x, y)
        elif kind in ("terminal", "coffee", "water", "food", "medkit"):
            height = {"terminal": 10, "coffee": 17, "water": 23, "food": 9, "medkit": 22}[kind]
            self.body(x, y, w, h, "#829c9b" if kind != "food" else "#ad906c", height)
            if kind == "terminal":
                self.display(x + 2, y - 13, w - 5, 9, chart=False)
                self.line((x + 3, y + h - 6, x + w - 5, y + h - 6), "#bccab3")
            elif kind == "coffee":
                self.rect((x + 3, y - 13, x + w - 5, y - 8), "#3b4548", "#b9c5b6")
                self.rect((x + 6, y - 12, x + 8, y - 10), "#dcac65")
                self.rect((x + 4, y - 6, x + w - 5, y + h - 5), "#243944")
                self.cup(x + w // 2, y + h - 9)
                self.line((x + 2, y + h - 3, x + w - 4, y + h - 3), "#d5d2b5")
            elif kind == "water":
                self.rect((x + 2, y - 20, x + w - 4, y - 6), "#629da9", INK)
                self.ellipse((x + 2, y - 23, x + w - 4, y - 16), "#a2c9cd", INK)
                self.line((x + 4, y - 19, x + 4, y - 8), "#c3e4df")
                self.rect((x + 3, y - 4, x + w - 5, y + 3), "#344c58")
                self.line((x + 5, y - 3, x + 6, y), "#e6b58b")
            elif kind == "food":
                for gx, col in zip(range(x + 6, x + w - 4, 10), ["#c58464", "#8fae77", "#c8b06d"]):
                    self.ellipse((gx - 4, y - 6, gx + 4, y), "#d3d8c6", INK)
                    self.ellipse((gx - 2, y - 5, gx + 2, y - 2), col)
                self.line((x + 3, y + h - 4, x + w - 5, y + h - 4), "#e1c292")
            else:
                self.rect((x + 3, y - 17, x + w - 5, y + h - 4), "#e1e6d4", "#9db0aa")
                self.rect((x + w // 2 - 1, y - 13, x + w // 2 + 1, y - 5), "#c97965")
                self.rect((x + w // 2 - 4, y - 10, x + w // 2 + 4, y - 8), "#c97965")
                self.rect((x + w - 6, y + h - 10, x + w - 5, y + h - 7), "#4e6f77")
        elif kind in ("desk", "monitor_desk", "console", "table", "dining_table", "kitchen_counter", "workstation"):
            metal = kind in ("console", "monitor_desk", "table", "workstation")
            color = "#71878a" if metal else "#b78b60"
            self.body(x, y, w, h, color, 9)
            if not metal:
                self.wood((x + 2, y - 7, x + w - 4, y + h - 10), color)
            if kind in ("console", "monitor_desk"):
                for gx in range(x + 4, x + w - 21, 28):
                    self.rect((gx + 9, y - 5, gx + 13, y + 1), INK)
                    self.display(gx, y - 19, 23, 15)
                for gx in range(x + 5, x + w - 6, 5):
                    self.rect((gx, y + h - 15, gx + 2, y + h - 13), self.rng.choice(["#a4d6bf", "#dca76d", "#33494f"]))
            elif kind in ("desk", "workstation"):
                self.display(x + 4, y - 17, 17, 12)
                self.rect((x + 7, y - 3, x + 18, y - 1), INK)
                self.paper(x + w - 14, y + h - 18)
            elif kind == "kitchen_counter":
                self.rect((x + 4, y - 6, x + 22, y + h - 12), "#3e5b64", "#c6d6d3")
                self.ellipse((x + 7, y - 4, x + 19, y + h - 13), "#739b9e")
                self.line((x + 12, y - 4, x + 12, y - 12, x + 18, y - 12), "#cad8d6", 2)
                self.cup(x + w - 9, y)
                self.rect((x + w // 2, y - 5, x + w // 2 + 12, y + 3), "#725940", "#d6b181")
                for gx in range(x + 3, x + w - 8, 18):
                    self.line((gx, y + h - 6, gx + 12, y + h - 6), "#dfc5a1")
            elif kind == "dining_table":
                for gx in range(x + 10, x + w - 5, 20):
                    self.ellipse((gx - 5, y - 5, gx + 5, y + 1), "#d9e1d5", INK)
                    self.ellipse((gx - 3, y - 4, gx + 3, y), "#b8c8bd")
                    self.cup(gx, y + h - 12)
            else:
                self.paper(x + 6, y - 5)
                self.rect((x + w - 15, y - 5, x + w - 5, y + 1), "#d0a452", INK)
        elif kind in ("bunk", "med_bed", "sofa"):
            color = "#778c89" if kind == "med_bed" else "#696d83"
            self.body(x, y, w, h, color, 7)
            if kind == "bunk":
                for yy, blanket in [(y - 5, "#5b8c9a"), (y + h // 2 - 2, "#ae7562")]:
                    self.rect((x + 3, yy, x + w - 5, yy + h // 2 - 5), "#e7dfc9", "#8a9a95")
                    self.d.rounded_rectangle((x + 7, yy + 2, x + w - 9, yy + 8), 2, fill="#faf2dc", outline="#bebea9")
                    self.rect((x + 3, yy + 10, x + w - 5, yy + h // 2 - 5), blanket)
                    self.line((x + 5, yy + 13, x + w - 7, yy + 13), shade(blanket, 0.3))
                    for xx in range(x + 9, x + w - 6, 8):
                        self.line((xx, yy + 15, xx + 2, yy + h // 2 - 7), shade(blanket, -0.15))
                self.rect((x - 1, y - 10, x + 2, y + h + 1), "#495b63")
                self.rect((x + w - 3, y - 10, x + w, y + h + 1), "#495b63")
                for yy in range(y + 14, y + h, 12):
                    self.line((x + w - 8, yy, x + w + 2, yy), "#aebcbb", 2)
            elif kind == "med_bed":
                self.d.rounded_rectangle((x + 2, y - 5, x + w - 4, y + h - 9), 3, fill="#e2eadd", outline="#9bafad")
                self.rect((x + 4, y - 3, x + 11, y + h - 11), "#fbf4df")
                self.rect((x + 14, y - 4, x + w - 5, y + h - 10), "#6ba79b")
                self.line((x + 15, y - 2, x + w - 7, y - 2), "#b1d9c4")
                self.line((x + 3, y + h - 5, x + w - 3, y + h - 5), "#d2dfd7", 2)
                self.display(x + w - 6, y - 24, 12, 12)
            else:
                self.rect((x + 2, y - 13, x + w - 3, y - 5), "#547f82", INK)
                for xx in range(x + 4, x + w - 8, 14):
                    self.d.rounded_rectangle((xx, y - 4, min(xx + 12, x + w - 5), y + h - 9), 2, fill="#71999a", outline="#45666e")
                for xx in (x, x + w - 6):
                    self.rect((xx, y - 6, xx + 5, y + h - 5), "#4a6b73", INK)
        elif kind in ("server_rack", "locker", "shelf", "cabinet", "medical_cart", "bookcase"):
            tall = kind not in ("medical_cart",)
            height = 22 if tall else 12
            color = "#947451" if kind in ("shelf", "bookcase") else "#6d8a92"
            self.body(x, y, w, h, color, height)
            if kind == "server_rack":
                self.rect((x + 3, y - 16, x + w - 5, y + h - 3), "#263b46", "#9bafb2")
                for yy in range(y - 13, y + h - 5, 7):
                    self.rect((x + 5, yy, x + w - 7, yy + 4), "#4b626b", INK)
                    self.rect((x + 7, yy + 2, x + 10, yy + 2), "#8ce5c5")
                    for gx in range(x + 14, x + w - 8, 3):
                        self.line((gx, yy + 1, gx, yy + 3), "#273f49")
            elif kind in ("shelf", "bookcase"):
                for yy in range(y - 16, y + h - 2, 10):
                    self.rect((x + 3, yy, x + w - 5, yy + 7), "#4e4940")
                    for gx in range(x + 5, x + w - 9, 9):
                        c = self.rng.choice(["#9b6554", "#b8a46d", "#668c8e", "#a5b899", "#c5c5aa"])
                        self.rect((gx, yy + 1, gx + 5, yy + 6), c, shade(c, -0.3))
                        self.line((gx + 1, yy + 2, gx + 4, yy + 2), shade(c, 0.4))
                    self.line((x + 2, yy + 8, x + w - 4, yy + 8), "#c6a574")
            else:
                for gx in range(x + 3, x + w - 8, 14):
                    self.rect((gx, y - height + 6, min(gx + 12, x + w - 5), y + h - 3), shade(color, -0.12), "#415760")
                    self.line((gx + 3, y - height + 10, gx + 8, y - height + 10), "#b3c9c5")
                    self.line((gx + 8, y + h - 12, gx + 8, y + h - 7), "#d3c28c")
                if kind == "medical_cart":
                    self.rect((x + 6, y - 10, x + 16, y - 6), "#e0dfc9", "#66858a")
                    self.line((x + 11, y - 11, x + 11, y - 6), "#cb705e")
                    self.line((x + 8, y - 9, x + 14, y - 9), "#cb705e")
        elif kind in ("generator", "air_filter", "tanks", "pipes", "battery"):
            if kind == "tanks":
                for gx in range(x, x + w - 12, 21):
                    self.ellipse((gx, y - 17, gx + 18, y + h), "#3b5968", INK)
                    self.rect((gx, y - 9, gx + 18, y + h - 9), "#6d9ea7", INK)
                    self.rect((gx + 3, y - 9, gx + 6, y + h - 9), "#9ac3bf")
                    self.rect((gx + 14, y - 8, gx + 17, y + h - 9), "#416573")
                    self.ellipse((gx, y - 17, gx + 18, y - 2), "#9ebdb9", INK)
                    self.ellipse((gx + 6, y - 20, gx + 12, y - 15), "#d2cfb3", INK)
                    self.line((gx + 2, y + h // 2, gx + 16, y + h // 2), "#314b57", 3)
            elif kind == "pipes":
                for yy, col in zip(range(y - 4, y + h, 5), ["#80aaa6", "#ad8466", "#7e96ad", "#80aaa6"] * 5):
                    self.rect((x, yy, x + w, yy + 4), col, INK)
                    self.line((x + 1, yy + 1, x + w - 1, yy + 1), shade(col, 0.4))
                for gx in range(x + 10, x + w - 5, 24):
                    self.rect((gx, y - 6, gx + 3, y + h), "#465a60", "#a5b6ac")
                    self.ellipse((gx - 3, y - 9, gx + 6, y), "#ba705b", INK)
                    self.line((gx - 1, y - 5, gx + 4, y - 5), "#ebbd83")
            else:
                self.body(x, y, w, h, "#77846d" if kind == "generator" else "#6c8a8d", 17)
                self.rect((x + 5, y - 11, x + w - 7, y + h - 19), "#344d54", INK)
                for gx in range(x + 8, x + w - 7, 5):
                    self.line((gx, y - 8, gx, y + h - 22), "#a2b3a5")
                self.display(x + 5, y + h - 14, min(16, w - 12), 8, chart=False)
                self.rect((x + w - 11, y + h - 12, x + w - 6, y + h - 7), "#d5ae65", INK)
                for gx in range(x + 5, x + w - 5, 7):
                    self.line((gx, y + h - 3, gx + 3, y + h - 3), "#d0ae69")
        elif kind == "crates":
            for gx in range(x, x + w - 8, 22):
                for gy in range(y, y + h - 5, 20):
                    cw, ch = min(20, x + w - gx), min(18, y + h - gy)
                    self.body(gx, gy, cw, ch, "#a6855d", 8)
                    self.rect((gx + 4, gy - 6, gx + 6, gy + ch - 1), "#56656a")
                    self.rect((gx + cw - 7, gy - 6, gx + cw - 5, gy + ch - 1), "#56656a")
                    self.rect((gx + 8, gy + 2, gx + 13, gy + 6), "#e1d4ad")
        elif kind == "vending":
            self.body(x, y, w, h, "#a96556", 26)
            self.display(x + 3, y - 21, w - 9, h + 12, chart=False)
            for yy in range(y - 16, y + h - 13, 6):
                for gx in range(x + 5, x + w - 9, 5):
                    self.rect((gx, yy, gx + 2, yy + 3), self.rng.choice(["#d8b46d", "#b0cba0", "#c77e60"]))
            self.rect((x + 5, y + h - 9, x + w - 6, y + h - 5), "#172c34")
            self.line((x + w - 5, y - 12, x + w - 5, y - 7), "#aee1bb")
        elif kind == "satellite":
            self.body(x + 12, y + 1, w - 24, h - 2, "#bd9f59", 10)
            for gx in (x - 3, x + w - 12):
                self.rect((gx, y - 4, gx + 15, y + h - 8), "#1e405c", "#a2b9b2")
                for xx in range(gx + 3, gx + 15, 4):
                    self.line((xx, y - 3, xx, y + h - 9), "#5a8daf")
                for yy in range(y, y + h - 8, 5):
                    self.line((gx + 1, yy, gx + 14, yy), "#3f6f96")
            self.ellipse((x + w // 2 - 6, y - 17, x + w // 2 + 6, y - 7), "#c2d6d1", INK)
            self.line((x + w // 2, y - 15, x + w // 2 + 7, y - 23), "#d3ba82")
        else:
            raise ValueError(f"Unknown interior asset: {kind}")
        crop = self.image.getbbox()
        return self.image.crop(crop), (crop[0] - self.x, crop[1] - self.y)


def export_furniture(layout, ground, output_dir):
    """Keep shadows in the floor image, but export solid artwork for Y sorting."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    shadow = ImageDraw.Draw(ground, "RGBA")
    entries, tiles = [], []
    atlas_x, atlas_y, row_h = 2, 2, 0

    def place(tile, offset, footprint, metadata):
        nonlocal atlas_x, atlas_y, row_h
        x, y, w, h = footprint
        if atlas_x + tile.width + 2 > 1024:
            atlas_x, atlas_y, row_h = 2, atlas_y + row_h + 4, 0
        entries.append({**metadata, "region": [atlas_x, atlas_y, tile.width, tile.height],
                        "position": [x + w / 2, y + h], "offset": [offset[0] - w / 2, offset[1] - h]})
        tiles.append((tile, (atlas_x, atlas_y)))
        atlas_x += tile.width + 4
        row_h = max(row_h, tile.height)

    for i, obstacle in enumerate(layout["obstacles"]):
        if obstacle["kind"] in ("car", "launch_pad"):
            continue
        x, y, w, h = obstacle["rect"]
        tile, offset = Furniture(w, h, i + 1701).draw(obstacle["kind"])
        # Directional cast shadow and a tight contact shadow under the feet.
        shadow.rounded_rectangle((x + 4, y + 4, x + w + 9, y + h + 7), radius=5, fill=(14, 28, 32, 40))
        shadow.rounded_rectangle((x + 1, y + h - 2, x + w + 2, y + h + 3), radius=2, fill=(12, 24, 27, 55))
        place(tile, offset, obstacle["rect"], {"name": f"Interior{i}", "source_index": i})
        kind = obstacle["kind"]
        seats = []
        if kind == "meeting_table":
            seats = [(x + w // 2 - 7, y - 23), (x + w + 10, y + h // 2 - 6),
                     (x + w // 2 - 7, y + h + 8), (x - 24, y + h // 2 - 6)]
        elif kind in ("console", "monitor_desk"):
            seats = [(x + w // 2 - 7, y + h + 8)]
        elif kind in ("desk", "workstation"):
            seats = [(x + w - 20, y + h + 6)]
        elif kind == "dining_table":
            seats = [(x, y + h + 5), (x + w - 14, y + h + 5)]
        # Every chair has its own depth anchor and a small solid base. Character
        # feet can pass in front or behind seats without painting over their backs.
        for j, (sx, sy) in enumerate(seats):
            chair, chair_offset = Furniture(14, 14, i + j).draw("chair")
            name = f"MeetingChair{i}_{j}" if kind == "meeting_table" else f"Chair{i}_{j}"
            place(chair, chair_offset, (sx, sy, 14, 14), {"name": name, "parent_index": i,
                  "collision": [sx + 2, sy + 8, 10, 6]})
            shadow.ellipse((sx, sy + 9, sx + 17, sy + 17), fill=(12, 24, 27, 38))
    # Interactive fixtures share the same perspective and lighting as furniture.
    fixtures = {"coffee_machine": ("coffee", 16, 10), "refill_water": ("water", 14, 10),
                "food_counter": ("food", 34, 10), "restock_medkits": ("medkit", 18, 10),
                "toolbox_shelf": ("shelf", 26, 14)}
    for spot in layout["spots"]:
        if spot["room"] == "outside" or spot["id"] in ("bunk", "assemble_panels", "health_scan"):
            continue
        kind, w, h = fixtures.get(spot["id"], ("terminal", 14, 8))
        x, y = spot["pos"]
        tile, offset = Furniture(w, h, sum(map(ord, spot["id"]))).draw(kind)
        footprint = (x - w // 2, y - h - 3, w, h)
        place(tile, offset, footprint, {"name": "Station_" + spot["id"], "source_spot": spot["id"]})
        shadow.ellipse((x - w // 2, y - 5, x + w // 2 + 4, y + 1), fill=(12, 24, 27, 38))
    atlas = Image.new("RGBA", (1024, atlas_y + row_h + 2))
    for tile, at in tiles:
        atlas.alpha_composite(tile, at)
    atlas.save(output_dir / "props.png")
    (output_dir / "props.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    return len(entries)
