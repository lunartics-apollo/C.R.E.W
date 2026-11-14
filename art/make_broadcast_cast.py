"""Original broadcast cast and soft terminal cues, no external assets.

Run: python art/make_broadcast_cast.py
Atlas: 96x112 RGBA frames; four mouth columns, nine expression rows below.
All shapes are authored on the native pixel grid; no smoothing or scaling.
"""
from pathlib import Path
import math
import struct
import wave

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "assets" / "briefing"
POSES = ("idle", "blink", "talk", "smile", "serious", "surprised", "thinking", "warning", "sign_off")
INK = "#172b37"
NAVY = "#294554"
LIGHT = "#496575"
TEAL = "#3e8e90"
GOLD = "#e8bd6d"
CREAM = "#eee4c8"
CAST = {
    "aisyah": ("#b77b59", "#dcab80", "#f1c69a", "#875441"),
    "hamdan": ("#aa7150", "#d29b70", "#e8b68c", "#80513f"),
    "jabu": ("#80573f", "#aa7954", "#ca9869", "#5e4136"),
    "ling": ("#c08c6e", "#edc29a", "#ffdab1", "#9e6b55"),
    "siti": ("#a76c4f", "#d89a70", "#efb78a", "#7c4c3b"),
}


def portrait(who, pose, mouth):
    im = Image.new("RGBA", (96, 112))
    d = ImageDraw.Draw(im)
    shadow, skin, shine, deep = CAST[who]
    # Slight asymmetric silhouette and lighting make the feed read as a person.
    def p(points, color):
        d.polygon(points, fill=color)
    def r(box, color):
        d.rectangle(box, fill=color)
    def line(points, color, width=1):
        d.line(points, fill=color, width=width)
    # Neck, shoulders, and relaxed arms. Bottom is cropped as a waist-up feed.
    p([(35,59),(60,59),(62,70),(78,74),(87,83),(94,111),(3,111),(9,84),(17,76),(33,70)], INK)
    jacket = TEAL if who == "ling" else ("#dcd7bc" if who == "siti" else NAVY)
    jacket_light = "#62a5a1" if who == "ling" else ("#f5ebcf" if who == "siti" else LIGHT)
    p([(33,70),(46,77),(61,69),(78,77),(84,84),(91,111),(7,111),(13,85),(21,78)], jacket)
    p([(13,87),(22,80),(30,81),(27,111),(7,111)], jacket_light)
    p([(66,77),(79,81),(85,96),(88,111),(68,111)], "#a8ad9d" if who == "siti" else "#223d4b")
    line([(23,91),(22,110)], INK)
    line([(76,92),(79,110)], INK)
    p([(36,60),(59,60),(60,70),(49,79),(35,71)], shadow)
    p([(37,62),(54,65),(54,71),(47,74),(37,69)], skin)
    # Distinct professional clothing, with useful small pixel clusters.
    if who == "jabu":
        p([(28,74),(37,75),(42,85),(42,111),(18,111),(20,82)], "#ad653e")
        p([(59,74),(68,76),(77,84),(80,111),(52,111),(53,85)], "#cb854b")
        p([(28,78),(33,80),(37,92),(36,111),(24,111),(24,87)], "#e4a45c")
        r((20,89,39,92), GOLD); r((55,89,75,92), GOLD)
        r((24,98,36,107), "#8b5136"); line([(25,100),(35,100)], "#e2a362")
        r((57,97,73,106), "#9a5a36"); r((62,94,64,101), "#c3c9b4")
        r((68,94,70,100), "#365b67")
        line([(48,82),(48,111)], "#84918e")
    elif who == "siti":
        p([(36,72),(46,80),(59,71),(60,111),(35,111)], "#457e68")
        p([(31,73),(37,74),(44,85),(36,90),(41,96),(35,111),(26,111)], CREAM)
        p([(63,73),(59,76),(50,85),(58,90),(53,98),(59,111),(71,111)], "#fcf0d7")
        line([(37,89),(42,85),(35,74)], "#abae9b")
        r((63,96,75,106), "#c1c4ac"); line([(64,96),(75,96)], "#fcf0d7")
        r((65,90,66,98), TEAL); r((70,91,71,98), "#b2734e")
        r((47,93,48,94), GOLD); r((47,104,48,105), GOLD)
    else:
        p([(33,71),(45,78),(40,86),(30,77)], jacket_light)
        p([(61,71),(48,78),(54,85),(66,77)], jacket_light)
        line([(47,80),(47,111)], INK)
        for y in (88,99,109):
            r((48,y,49,y+1), GOLD if who != "ling" else "#a1d1bb")
        r((57,91,74,99), "#233c48"); line([(58,91),(73,91)], jacket_light)
        if who != "ling":
            r((60,84,70,85), GOLD); r((63,81,67,87), GOLD)
            r((17,77,28,79), GOLD); r((69,77,78,79), GOLD)
            r((59,102,64,103), TEAL); r((65,102,70,103), GOLD)
        else:
            r((57,84,68,87), "#d2d8be"); r((59,85,64,85), NAVY)
            line([(16,86),(23,83)], "#84bbb0", 2)
    # Hair mass lies behind ears and face: deliberately different silhouettes.
    if who == "aisyah":
        p([(17,63),(18,32),(21,21),(27,13),(40,8),(54,8),(67,13),(75,25),(78,45),(76,68),(82,79),(68,83),(59,76),(29,80),(16,74)], INK)
        p([(20,61),(21,31),(25,22),(31,15),(42,11),(55,12),(65,17),(72,28),(74,52),(71,67),(77,76),(67,79),(57,73),(30,76),(20,71)], "#6f8b77")
        p([(24,30),(31,20),(43,15),(54,15),(63,20),(68,31),(59,25),(39,23),(30,32),(26,52),(24,67),(20,68)], "#a1b59a")
        p([(68,32),(72,44),(70,65),(74,74),(65,76),(57,70),(49,74),(35,72),(27,65),(29,49)], "#526f65")
    elif who == "siti":
        p([(21,55),(17,46),(19,37),(16,30),(21,24),(21,18),(28,16),(31,10),(39,12),(45,8),(52,11),(61,10),(65,15),(72,16),(74,23),(79,29),(77,37),(80,43),(76,51),(78,61),(70,70),(26,68)], INK)
        # Uneven curls: shaded angular locks instead of uniform round dots.
        for x,y in [(24,23),(34,16),(46,13),(58,16),(68,22),(71,32),(74,44),(23,36),(22,47),(25,58),(69,58)]:
            p([(x-5,y),(x-3,y-5),(x+3,y-4),(x+6,y+1),(x+3,y+6),(x-3,y+4)], "#413c37")
            line([(x-3,y-2),(x,y-3),(x+3,y-1)], "#655346")
            r((x-3,y+2,x-1,y+4), "#2b3030")
    else:
        hair = "#707a78" if who == "jabu" else ("#596161" if who == "hamdan" else "#263b41")
        p([(23,43),(21,29),(25,18),(31,13),(45,10),(60,12),(69,17),(75,27),(73,45),(66,55),(28,53)], INK)
        p([(24,36),(24,27),(29,19),(39,14),(55,14),(67,19),(72,29),(69,43),(29,45)], hair)
    # Ears, face, warm planes, neck contact shadow.
    if who != "aisyah":
        p([(24,38),(29,38),(31,45),(28,53),(24,51),(22,45)], deep)
        p([(25,40),(29,40),(29,47),(27,50),(24,47)], skin)
        line([(26,42),(27,42),(27,46)], shadow)
        p([(67,38),(72,37),(74,43),(72,50),(68,53),(66,46)], deep)
        p([(69,40),(72,40),(72,46),(69,49)], skin)
    p([(30,26),(38,21),(55,22),(63,27),(68,36),(68,49),(64,59),(56,66),(42,67),(34,61),(29,52),(27,39)], deep)
    p([(31,28),(39,24),(54,25),(61,29),(65,37),(65,49),(61,58),(54,63),(43,64),(36,59),(31,51),(29,39)], skin)
    p([(32,30),(39,26),(49,26),(47,34),(35,36),(31,44),(30,37)], shine)
    p([(58,30),(64,37),(65,49),(61,56),(57,59),(56,52),(60,46)], shadow)
    p([(35,51),(40,54),(43,60),(50,63),(43,63),(37,58)], shadow)
    r((33,47,37,49), shine); r((54,46,58,48), shine)
    # Nose bridge is off-center with one bright edge and a two-pixel nostril.
    line([(48,39),(47,45),(45,49),(46,51),(50,51)], shadow)
    line([(49,42),(50,47),(52,49)], shine)
    r((49,50,51,51), deep)
    # Hairline/forehead framing. Character-specific cuts are hand authored.
    if who == "aisyah":
        p([(27,39),(28,29),(35,22),(44,20),(55,21),(63,26),(68,37),(65,36),(60,29),(53,26),(40,25),(33,29),(30,40),(30,56),(36,63),(46,69),(57,65),(64,57),(66,44),(70,46),(69,59),(61,69),(49,74),(36,69),(27,59)], "#799681")
        line([(31,27),(39,23),(53,24),(62,29)], "#c0c9a8")
        line([(25,35),(24,55),(27,65),(35,72)], "#a2b29a")
        line([(58,73),(65,68),(68,60)], "#34564e")
        r((63,70,66,72), GOLD); r((64,69,65,73), "#f1d69a")
    elif who == "hamdan":
        p([(26,38),(25,28),(29,21),(38,16),(52,15),(65,20),(70,28),(70,39),(65,35),(64,26),(55,22),(39,23),(31,28),(30,39)], "#4c5557")
        p([(27,29),(30,22),(38,18),(50,17),(54,19),(40,20),(31,26),(28,37)], "#9ba29a")
        line([(53,18),(63,21),(67,26)], "#919a95", 2)
        line([(29,31),(29,39)], "#cad0bc", 2)
        line([(67,31),(68,40)], "#bbc4b5", 2)
        line([(36,31),(43,30),(51,31)], shadow)
        line([(37,33),(43,32)], shine)
    elif who == "jabu":
        p([(26,39),(24,29),(27,22),(25,18),(36,19),(43,12),(56,12),(69,17),(73,25),(69,37),(65,39),(64,29),(56,25),(42,27),(35,32),(30,31),(30,41)], "#78827f")
        p([(26,23),(35,22),(44,16),(57,15),(67,19),(61,20),(43,21),(33,27)], "#c2c5af")
        line([(34,27),(44,23),(57,22)], "#9fa99c", 2)
        p([(65,25),(70,23),(69,34),(66,39),(64,35)], "#4a6261")
        line([(29,34),(29,40)], "#aeb7a5", 2)
        line([(36,32),(42,31)], shadow)
        r((60,53,62,54), deep)
        line([(58,57),(61,55)], deep)
    elif who == "ling":
        p([(24,37),(24,27),(29,20),(36,15),(50,13),(63,17),(69,23),(71,35),(66,40),(63,31),(57,28),(48,32),(42,30),(35,34),(31,30),(29,40)], "#22373d")
        p([(28,26),(36,19),(49,16),(61,19),(66,24),(56,22),(46,24),(38,26),(32,29)], "#425a5d")
        line([(36,21),(47,18),(55,19)], "#66817d", 2)
        # Closed headset arc, cup and deliberate microphone tip.
        line([(22,36),(22,25),(26,18),(36,13),(51,11),(64,15),(72,23),(75,36)], "#101f2b", 3)
        line([(24,28),(26,21),(33,16)], "#829e95")
        r((19,35,25,49), INK); r((20,38,23,46), "#6e8b8a")
        r((71,35,77,48), INK); r((73,38,76,45), "#577679")
        line([(74,48),(72,56),(64,59),(57,59)], "#a4b7a5", 2)
        r((54,57,59,60), INK); r((55,58,57,58), TEAL)
    else:
        p([(26,33),(27,26),(31,22),(37,21),(41,24),(37,27),(33,28),(31,36),(29,42),(27,41)], "#413c37")
        p([(54,24),(58,21),(64,23),(67,27),(67,36),(64,37),(61,29)], "#413c37")
        line([(29,28),(32,25),(36,25)], "#78604c")
        r((26,52,28,54), GOLD); r((70,52,72,54), GOLD)
    # Eyes and eyebrows carry expression independent of speaking.
    left, right, ey = 37, 57, 40
    if pose == "surprised":
        brow_l, brow_r = [(32,33),(40,32),(43,33)], [(53,32),(61,32),(64,34)]
    elif pose in ("serious", "warning"):
        brow_l, brow_r = [(32,35),(43,38)], [(53,38),(63,35)]
    elif pose == "thinking":
        brow_l, brow_r = [(32,34),(43,35)], [(53,33),(63,32)]
    else:
        brow_l, brow_r = [(32,36),(36,35),(42,36)], [(53,36),(59,35),(63,36)]
    line(brow_l, INK, 2); line(brow_r, INK, 2)
    for x in (left,right):
        if pose == "blink":
            line([(x-4,ey+2),(x,ey+3),(x+4,ey+2)], deep, 2)
            line([(x-3,ey+4),(x+2,ey+4)], shadow)
        elif pose in ("smile", "sign_off"):
            line([(x-4,ey+2),(x-2,ey),(x+1,ey),(x+4,ey+2)], INK, 2)
            r((x-3,ey+5,x+2,ey+5), shadow)
        else:
            height = 5 if pose == "surprised" else 3
            p([(x-5,ey),(x-2,ey-1),(x+2,ey-1),(x+5,ey+1),(x+3,ey+height),(x-3,ey+height)], deep)
            r((x-3,ey,x+3,ey+height-1), "#f5e4c9")
            gaze = 1 if pose == "thinking" else 0
            r((x-1+gaze,ey,x+1+gaze,ey+height), "#294943")
            r((x+gaze,ey,x+1+gaze,ey+height), INK)
            r((x+gaze,ey,x+gaze,ey), CREAM)
            r((x-4,ey+height+2,x-1,ey+height+2), shadow)
    if who == "siti":
        # Thin amber rims leave the eyes readable at native size.
        for x in (37,57):
            line([(x-8,38),(x-7,36),(x+6,36),(x+8,38),(x+7,46),(x+4,48),(x-5,47),(x-8,44),(x-8,38)], "#755b39")
            line([(x-6,37),(x-2,37)], GOLD)
        line([(45,39),(48,38),(49,39)], "#755b39")
        line([(27,38),(29,39)], "#755b39", 2)
    # Four universal visemes; lip edge and chin light keep tiny shapes legible.
    mx, my = 47, 57
    if who == "hamdan":
        p([(37,53),(43,52),(47,53),(52,52),(58,54),(59,56),(52,56),(47,55),(42,56),(36,56)], "#5e5e55")
        line([(39,53),(43,53)], "#b2aa92")
        line([(51,53),(55,54)], "#b2aa92")
        my = 58
    if mouth == 0:
        if pose in ("smile","sign_off"):
            line([(mx-6,my-1),(mx-3,my+1),(mx+3,my+1),(mx+6,my-1)], deep)
            r((mx-2,my+3,mx+2,my+3), shine)
        elif pose == "surprised":
            r((mx-1,my-1,mx+2,my+2), deep)
        else:
            line([(mx-5,my),(mx-1,my+1),(mx+4,my)], deep)
            r((mx-1,my+2,mx+3,my+2), shine)
    elif mouth == 1:
        p([(mx-3,my-1),(mx+2,my-1),(mx+4,my+1),(mx+2,my+3),(mx-2,my+3),(mx-4,my+1)], deep)
        r((mx-1,my+2,mx+1,my+2), "#c27766")
    elif mouth == 2:
        p([(mx-5,my-1),(mx+4,my-1),(mx+6,my+1),(mx+4,my+5),(mx-3,my+5),(mx-5,my+2)], "#623f3c")
        r((mx-3,my,mx+3,my), "#f4dcbc")
        r((mx-2,my+3,mx+2,my+4), "#cc8170")
        r((mx-2,my+6,mx+2,my+6), shine)
    else:
        p([(mx-6,my-2),(mx+5,my-2),(mx+7,my),(mx+5,my+5),(mx+2,my+7),(mx-3,my+6),(mx-6,my+3)], "#563a38")
        r((mx-4,my-1,mx+4,my), "#ffe6c6")
        p([(mx-2,my+4),(mx+3,my+4),(mx+4,my+5),(mx+1,my+6),(mx-3,my+5)], "#d68b76")
    # Articulated gesture hands sit in front, maintaining the shared head anchor.
    if pose == "thinking":
        p([(17,111),(20,94),(27,84),(35,71),(42,69),(47,75),(43,84),(37,91),(35,111)], INK)
        p([(21,111),(24,95),(31,85),(37,76),(44,78),(40,86),(33,95),(32,111)], jacket_light)
        p([(35,77),(34,70),(37,65),(41,64),(44,66),(50,65),(54,67),(53,71),(47,74),(44,80),(39,81)], deep)
        p([(37,75),(37,69),(40,66),(43,68),(49,67),(51,68),(47,70),(44,72),(42,77)], skin)
        line([(39,69),(42,70),(45,69)], shine)
        line([(35,82),(41,86)], INK)
    elif pose == "warning":
        p([(7,111),(8,89),(12,77),(17,75),(25,80),(29,94),(29,111)], INK)
        p([(10,111),(11,91),(15,82),(21,83),(24,94),(25,111)], jacket_light)
        p([(13,83),(10,76),(10,68),(13,65),(13,52),(15,50),(18,51),(19,65),(23,64),(27,67),(28,73),(24,82),(22,86)], deep)
        p([(14,80),(12,74),(13,69),(16,68),(15,54),(17,53),(18,69),(22,67),(25,69),(25,74),(21,82)], skin)
        line([(16,56),(16,63)], shine)
        line([(20,71),(22,72),(22,76)], shadow)
        line([(12,85),(23,88)], INK, 2)
    elif pose == "sign_off":
        p([(69,111),(68,91),(72,78),(77,74),(85,77),(90,90),(94,111)], INK)
        p([(73,111),(72,91),(76,82),(83,82),(87,94),(91,111)], jacket_light)
        p([(76,83),(70,74),(68,67),(64,61),(65,58),(68,58),(72,63),(70,51),(72,48),(75,50),(77,61),(78,45),(81,44),(83,47),(83,61),(86,49),(89,50),(89,54),(87,65),(90,58),(93,58),(94,62),(89,76),(85,84)], deep)
        p([(78,80),(73,72),(71,66),(67,61),(67,60),(71,62),(75,68),(73,52),(74,52),(79,67),(80,48),(81,48),(81,66),(87,53),(87,57),(85,70),(91,61),(92,62),(87,74),(83,81)], skin)
        line([(78,70),(81,68),(85,70)], shine)
        line([(78,74),(82,75)], shadow)
        line([(74,85),(85,88)], INK, 2)
    elif pose == "talk":
        # Open, conversational palm at the bottom edge.
        p([(7,111),(10,105),(19,103),(23,105),(30,101),(33,102),(31,105),(39,104),(41,107),(37,111)], deep)
        p([(12,111),(13,107),(21,106),(24,108),(30,104),(29,107),(36,106),(37,108),(31,111)], skin)
        line([(17,108),(22,109)], shine)
    return im


def audio(name, duration, voices):
    """Voices are (start, length, frequency, end_frequency, volume)."""
    sr = 22050
    samples = []
    for i in range(round(sr * duration)):
        t = i / sr
        v = 0.0
        for start, length, freq, end, gain in voices:
            dt = t - start
            if 0 <= dt < length:
                env = min(1, dt / .012) * min(1, (length-dt)/.04)
                phase = 2 * math.pi * (freq*dt + (end-freq)*dt*dt/(2*length))
                v += gain * env * (math.sin(phase) + .15*math.sin(phase*2)) / 1.15
        samples.append(round(max(-.24, min(.24, v)) * 32767))
    with wave.open(str(OUT / (name + ".wav")), "wb") as f:
        f.setparams((1, 2, sr, 0, "NONE", "not compressed"))
        f.writeframes(struct.pack("<" + "h"*len(samples), *samples))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGB", (5*96, 9*112), "#233f4b")
    for ci, who in enumerate(CAST):
        sheet = Image.new("RGBA", (384, 1008))
        for ri, pose in enumerate(POSES):
            row = []
            for mi in range(4):
                frame = portrait(who, pose, mi)
                assert sum(frame.getchannel("A").histogram()[1:]) > 3000
                sheet.paste(frame, (mi*96, ri*112))
                row.append(frame.tobytes())
                if mi == (2 if pose == "talk" else 0):
                    preview.paste(frame, (ci*96, ri*112), frame)
            assert len(set(row)) == 4, (who, pose, "visemes must differ")
        assert len({portrait(who, pose, 0).tobytes() for pose in POSES}) == 9
        sheet.save(OUT / f"cast_{who}.png")
    preview.save(OUT / "cast_preview.png")
    audio("incoming", .69, [(0,.14,660,660,.13),(.22,.14,660,660,.13),(.44,.19,880,880,.13)])
    audio("connect", .62, [(0,.5,320,730,.10),(.32,.22,880,880,.055)])
    audio("tick", .06, [(0,.055,175,220,.07),(0,.04,730,610,.025)])
    audio("confirm", .53, [(0,.18,523.25,523.25,.11),(.12,.19,659.25,659.25,.11),(.25,.25,783.99,783.99,.11)])
    audio("shutdown", .52, [(0,.46,640,180,.105)])
    for name in ("incoming", "connect", "tick", "confirm", "shutdown"):
        with wave.open(str(OUT / (name + ".wav")), "rb") as f:
            assert (f.getnchannels(), f.getsampwidth(), f.getframerate()) == (1,2,22050)
            values = struct.unpack("<" + "h"*f.getnframes(), f.readframes(f.getnframes()))
            assert max(abs(v) for v in values) / 32767 < .25
    print("Verified 5 native 384x1008 RGBA atlases (180 frames), nine distinct poses and four visemes each; 5 mono PCM cues below 0.25 peak.")


if __name__ == "__main__":
    main()
