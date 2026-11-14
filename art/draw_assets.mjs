// Draws the game's sprites live in Pixelorama through the pix-MCP bridge (port 7373),
// then exports PNG sheets into assets/sprites and saves editable .pxo sources next to this file.
// Run with Pixelorama open:  node art/draw_assets.mjs [sprite names...]
import { fileURLToPath } from "node:url";
import path from "node:path";

const BRIDGE = "http://127.0.0.1:7373";
const ART_DIR = path.dirname(fileURLToPath(import.meta.url));
const SPRITE_DIR = path.join(ART_DIR, "..", "assets", "sprites");
const toPx = (p) => p.replaceAll("\\", "/");

// Palette lifted from the existing game art (world.gd / menu.gd / make_world.py).
const C = {
  o: "#513e3e", // outline ink
  h: "#735044", // hair
  H: "#9a6c55", // hair highlight
  s: "#f2c19a", // skin
  S: "#e09a84", // blush
  t: "#6f9d9e", // suit
  T: "#557f80", // suit shade
  w: "#e5edda", // collar
  b: "#4e403b", // belt
  B: "#8e6e61", // boots
  y: "#e9ba7a", // badge / accent
  Y: "#fff0c9", // accent highlight
  g: "#c2c4b4", // backpack
  G: "#8b9d99", // backpack shade
  d: "#00000040", // ground shadow
  r: "#d67968", // warning light / stripe
  R: "#9c5c53", // light off
  k: "#b38c75", // wood
  u: "#c99556", // gold foil shade
  p: "#638e9a", // solar panel
  P: "#94c6c1", // panel glint
  c: "#a5d7d0", // lens
  v: "#d4dfc9a0", // vapour
  // Rocket: 5-step ramps (0 highlight, 1 light, 2 base, 3 shade, 4 deep shade) for round shading.
  c0: "#fffaf0", c1: "#f7eedb", c2: "#ece0c6", c3: "#cdc8b3", c4: "#a9a796",
  r0: "#f2a690", r1: "#e48c78", r2: "#d67968", r3: "#b65e52", r4: "#8f4a43",
  m0: "#d5dcd6", m1: "#b4c0bb", m2: "#8b9d99", m3: "#6b797b", m4: "#4f5b5d",
  e2: "#638e9a", e3: "#4c7380", // emblem teal
  n: "#6ba4a6", N: "#c8e4d3", // porthole glass + glint
  O: "#4a3f40", // rocket ink
  L: "#ff7a5c", l: "#7c4b45", // nav light on / off
  f0: "#fff6c8", f1: "#ffd36b", f2: "#ff9a3d", f3: "#e0582f", // flame core to edge
};

async function cmd(tool, params = {}) {
  const res = await fetch(`${BRIDGE}/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, params }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${tool} failed: ${json.error}`);
  return json.data;
}

class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Map();
  }
  px(x, y, c) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells.set(`${x},${y}`, c);
  }
  rect(x, y, w, h, c) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.px(i, j, c);
  }
  // Filled box with a 1px ink border.
  box(x, y, w, h, fill) {
    this.rect(x, y, w, h, "o");
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }
  // Box with its top corners knocked off, for cylinders and tanks.
  roundTop(x, y, w, h, fill) {
    this.box(x, y, w, h, fill);
    this.cells.delete(`${x},${y}`);
    this.cells.delete(`${x + w - 1},${y}`);
    this.px(x + 1, y + 1, "o");
    this.px(x + w - 2, y + 1, "o");
  }
  mirrored() {
    const g = new Grid(this.w, this.h);
    for (const [k, c] of this.cells) {
      const [x, y] = k.split(",").map(Number);
      g.px(this.w - 1 - x, y, c);
    }
    return g;
  }
  flat() {
    const out = [];
    for (const [k, c] of this.cells) {
      const [x, y] = k.split(",").map(Number);
      out.push(x, y, C[c]);
    }
    return out;
  }
}

// ── Player: 16x24 frames, feet on row 21, shadow on rows 22-23 ───────────────
// Walk cycle phase: 0 stand, 1 left foot forward, 2 stand, 3 right foot forward.
const W = 16, H = 24;

function shadow(g) {
  g.rect(4, 22, 8, 1, "d");
  g.rect(5, 23, 6, 1, "d");
}

function frontBody(g, phase, back) {
  const bob = phase % 2 === 1 ? -1 : 0;
  const lift = (leg) => (phase === 1 && leg === 1) || (phase === 3 && leg === 0) ? 1 : 0;
  // Legs and boots.
  for (const [leg, x] of [[0, 5], [1, 9]]) {
    const up = lift(leg);
    g.rect(x - 1, 17 - up, 4, 5, "o");
    g.rect(x, 17 - up, 2, 3, "T");
    g.rect(x, 20 - up, 2, 1, "B");
  }
  // Arms swing opposite to the legs.
  const armL = phase === 3 ? -1 : phase === 1 ? 1 : 0;
  const armR = -armL;
  for (const [x, dy] of [[2, armL], [12, armR]]) {
    const inner = x === 2 ? 3 : 12;
    g.rect(x, 11 + bob + dy, 2, 6, "o");
    g.px(inner, 12 + bob + dy, "t");
    g.px(inner, 13 + bob + dy, "t");
    g.px(inner, 14 + bob + dy, "T");
    g.px(inner, 15 + bob + dy, "s");
  }
  // Torso.
  g.box(4, 10 + bob, 8, 8, "t");
  g.rect(10, 11 + bob, 1, 6, "T");
  g.rect(5, 16 + bob, 6, 1, "b");
  if (back) {
    g.box(5, 11 + bob, 6, 5, "g");
    g.rect(6, 14 + bob, 4, 1, "G");
    g.px(7, 12 + bob, "y");
  } else {
    g.rect(6, 11 + bob, 4, 1, "w");
    g.px(9, 13 + bob, "y");
    g.px(9, 14 + bob, "Y");
  }
  // Head.
  g.box(3, 1 + bob, 10, 10, back ? "h" : "s");
  g.rect(4, 2 + bob, 8, 2, "h");
  g.px(5, 2 + bob, "H");
  g.px(6, 2 + bob, "H");
  if (back) {
    g.rect(6, 9 + bob, 4, 1, "s");
    g.rect(5, 6 + bob, 1, 2, "H");
  } else {
    g.px(4, 4 + bob, "h");
    g.px(11, 4 + bob, "h");
    g.px(4, 5 + bob, "h");
    g.px(11, 5 + bob, "h");
    g.px(6, 6 + bob, "o");
    g.px(9, 6 + bob, "o");
    g.px(5, 7 + bob, "S");
    g.px(10, 7 + bob, "S");
  }
  // Headset antenna: a small space-center touch.
  g.px(12, 0 + bob, "y");
  g.px(12, 1 + bob, "o");
}

// Left-facing profile; the right-facing frames are mirrored from this.
function sideBody(g, phase) {
  const bob = phase % 2 === 1 ? -1 : 0;
  const stride = phase === 1 ? 1 : phase === 3 ? -1 : 0; // +1: near leg forward
  const legs = stride === 0 ? [6] : [5, 8];
  for (const x of legs) {
    g.rect(x - 1, 17, 4, 5, "o");
    g.rect(x, 17, 2, 3, "T");
    g.rect(x, 20, 2, 1, "B");
  }
  if (stride === 0) g.rect(5, 20, 3, 1, "B");
  // Torso.
  g.box(5, 10 + bob, 7, 8, "t");
  g.rect(10, 11 + bob, 1, 6, "T");
  g.rect(6, 16 + bob, 5, 1, "b");
  g.box(10, 11 + bob, 3, 5, "g"); // backpack
  g.px(6, 11 + bob, "w");
  // Arm swings with the stride.
  const ax = 8 - stride;
  g.rect(ax - 1, 12 + bob, 1, 4, "o");
  g.rect(ax, 12 + bob, 1, 3, "T");
  g.px(ax, 15 + bob, "s");
  g.px(ax, 16 + bob, "o");
  // Head.
  g.box(3, 1 + bob, 10, 10, "s");
  g.rect(4, 2 + bob, 8, 2, "h");
  g.rect(8, 4 + bob, 4, 4, "h");
  g.px(5, 2 + bob, "H");
  g.px(6, 2 + bob, "H");
  g.px(9, 5 + bob, "H");
  g.px(5, 6 + bob, "o");
  g.px(6, 7 + bob, "S");
  g.px(12, 0 + bob, "y");
  g.px(12, 1 + bob, "o");
}

function playerFrames() {
  const rows = { down: [], up: [], left: [], right: [] };
  for (let p = 0; p < 4; p++) {
    for (const dir of ["down", "up"]) {
      const g = new Grid(W, H);
      shadow(g);
      frontBody(g, p, dir === "up");
      rows[dir].push(g);
    }
    const side = new Grid(W, H);
    shadow(side);
    sideBody(side, p);
    rows.left.push(side);
    rows.right.push(side.mirrored());
  }
  return [...rows.down, ...rows.up, ...rows.left, ...rows.right];
}

// ── Objective marker: 12x14 bobbing arrow with a sparkle, 4 frames ───────────
function markerFrames() {
  const frames = [];
  for (let p = 0; p < 4; p++) {
    const g = new Grid(12, 14);
    const dy = [0, 1, 2, 1][p];
    g.rect(3, 13, 6, 1, "d");
    // Down-pointing arrow: a stem over a chevron.
    g.rect(3, dy, 6, 5, "o");
    g.rect(4, dy + 1, 4, 4, "y");
    g.rect(0, dy + 5, 12, 2, "o");
    g.rect(1, dy + 5, 10, 1, "y");
    for (let i = 0; i < 5; i++) {
      g.rect(1 + i, dy + 6 + i, 10 - 2 * i, 1, "o");
      g.rect(2 + i, dy + 6 + i, Math.max(0, 8 - 2 * i), 1, "y");
    }
    g.rect(4, dy + 1, 1, 6, "Y");
    if (p === 1 || p === 2) g.px(10, dy, "Y");
    frames.push(g);
  }
  return frames;
}

// ── Station props: all have a 2-row ground shadow at the bottom ─────────────

// Mission Control: a radar dish sweeping between front-on and side-on, light blinking.
function dishFrames() {
  const frames = [];
  for (let p = 0; p < 4; p++) {
    const g = new Grid(24, 28);
    const squash = [1, 0.72, 0.45, 0.72][p];
    const aim = [0, 2, 3, 2][p];
    g.rect(3, 26, 18, 2, "d");
    g.box(10, 15, 4, 8, "G");
    g.box(5, 20, 14, 6, "g");
    g.rect(6, 24, 12, 1, "G");
    g.px(15, 22, p < 2 ? "r" : "R");
    const cx = 12, cy = 9, rad = 8;
    for (let y = 0; y < 19; y++) {
      for (let x = 0; x < 24; x++) {
        const dx = (x + 0.5 - cx) / squash, dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        if (d > rad) continue;
        if (d > rad - 1.2) g.px(x, y, "o");
        else g.px(x, y, Math.hypot(dx + 2, dy + 2) > rad - 1 ? "g" : "w");
      }
    }
    g.rect(cx - 1, cy - 1, 2, 2, "G");
    g.box(cx + aim - 1, cy - 3, 3, 3, "y");
    frames.push(g);
  }
  return frames;
}

// Spacecraft Lab: workbench with a satellite. Frames 0-3 "building" (welding sparks,
// one panel still on the bench); frame 4 "done" (both panels fitted).
function workbenchFrames() {
  const sparks = [
    [[22, 6, "Y"], [23, 5, "w"]],
    [[22, 8, "Y"], [24, 7, "Y"], [23, 4, "w"]],
    [[21, 6, "w"]],
    [[23, 7, "Y"], [25, 6, "w"], [22, 9, "Y"]],
  ];
  const panel = (g, x) => {
    g.box(x, 5, 9, 6, "p");
    g.rect(x + 4, 6, 1, 4, "o");
    g.px(x + 1, 6, "P");
    g.px(x + 2, 6, "P");
  };
  const frames = [];
  for (let p = 0; p < 5; p++) {
    const done = p === 4;
    const g = new Grid(32, 24);
    g.rect(2, 22, 28, 2, "d");
    for (const x of [3, 26]) {
      g.rect(x, 15, 3, 7, "o");
      g.rect(x + 1, 15, 1, 6, "B");
    }
    g.box(1, 12, 30, 4, "k");
    g.rect(2, 14, 28, 1, "B");
    // Satellite body, lens and antenna.
    g.box(11, 4, 10, 9, "y");
    g.rect(12, 5, 2, 7, "Y");
    g.rect(19, 5, 1, 7, "u");
    g.box(14, 8, 4, 3, "o");
    g.px(15, 9, "c");
    g.px(16, 9, "c");
    g.rect(16, 2, 1, 2, "o");
    g.px(16, 1, "y");
    g.rect(9, 7, 2, 1, "o");
    panel(g, 1);
    if (done) {
      g.rect(21, 7, 2, 1, "o");
      panel(g, 22);
    } else {
      g.rect(22, 10, 8, 2, "o");
      g.rect(23, 10, 6, 1, "p");
      for (const [x, y, c] of sparks[p]) g.px(x, y, c);
    }
    frames.push(g);
  }
  return frames;
}

// Launch Pad: two fuel tanks joined by pipes, a blinking light and a venting valve.
function fuelTankFrames() {
  const puffs = [[], [[8, 1, 2, 1]], [[9, 0, 3, 2]], [[11, 0, 2, 1]]];
  const frames = [];
  for (let p = 0; p < 4; p++) {
    const g = new Grid(28, 32);
    g.rect(1, 30, 26, 2, "d");
    // Tall tank.
    g.roundTop(2, 6, 11, 24, "w");
    g.rect(10, 7, 2, 22, "g");
    g.rect(4, 8, 1, 15, "Y");
    g.rect(3, 12, 9, 2, "r");
    g.rect(3, 24, 9, 1, "g");
    g.rect(6, 4, 3, 2, "o");
    g.px(7, 4, "G");
    // Short tank with a pressure gauge.
    g.roundTop(14, 13, 10, 17, "w");
    g.rect(21, 14, 2, 15, "g");
    g.rect(15, 18, 8, 2, "r");
    g.box(16, 22, 4, 4, "Y");
    g.px(17, 23, "o");
    g.px(19, 12, p % 2 === 0 ? "r" : "R");
    // Pipes.
    g.rect(13, 20, 1, 2, "G");
    g.rect(24, 24, 4, 2, "G");
    for (const [x, y, w, h] of puffs[p]) g.rect(x, y, w, h, "v");
    frames.push(g);
  }
  return frames;
}

// ── Rocket: 44x80, engines centred on columns 8 (left booster), 22 (core), 36 (right
// booster) with bells ending on row 78, matching the menu's exhaust code. ─────────────

// One rocket part drawn as a stack of rows, shaded like a lit cylinder (light from the
// left) and outlined on its own so overlapping parts keep their silhouettes.
class Part {
  constructor() {
    this.cells = new Map();
  }
  // Row y spanning cx-half..cx+half in a material ramp ("c", "r", "m", "e"); toneShift darkens.
  row(y, cx, half, mat, toneShift = 0) {
    for (let x = cx - half; x <= cx + half; x++) {
      const t = half === 0 ? 0.5 : (x - (cx - half)) / (2 * half);
      const tone = t < 0.12 ? 1 : t < 0.36 ? 0 : t < 0.64 ? 2 : t < 0.86 ? 3 : 4;
      this.cells.set(`${x},${y}`, `${mat}${Math.min(4, tone + toneShift)}`);
    }
  }
  set(x, y, c) {
    this.cells.set(`${x},${y}`, c);
  }
  // Composite onto a grid, ringing the part with ink where it meets empty space.
  stamp(g) {
    for (const k of this.cells.keys()) {
      const [x, y] = k.split(",").map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!this.cells.has(`${x + dx},${y + dy}`)) g.px(x + dx, y + dy, "O");
      }
    }
    for (const [k, c] of this.cells) {
      const [x, y] = k.split(",").map(Number);
      g.px(x, y, c);
    }
  }
}

function booster(cx) {
  const p = new Part();
  for (let y = 31; y <= 37; y++) p.row(y, cx, Math.round(3 * Math.pow((y - 30) / 7, 0.7)), "r");
  for (let y = 38; y <= 71; y++) {
    const mat = y >= 44 && y <= 46 ? "r" : y >= 66 && y <= 67 ? "m" : "c";
    p.row(y, cx, 3, mat, y === 56 ? 1 : 0); // seam line at 56
  }
  for (let y = 72; y <= 73; y++) p.row(y, cx, 3, "m", 1);
  [2, 2, 2, 3, 3].forEach((h, i) => p.row(74 + i, cx, h, "m", i === 4 ? 1 : 0));
  return p;
}

function coreStage() {
  const cx = 22, p = new Part();
  p.set(cx, 1, "m1"); // escape tower rod
  for (let y = 2; y <= 17; y++) {
    const half = Math.max(0, Math.round(6 * Math.pow((y - 1) / 17, 0.62)));
    p.row(y, cx, half, y <= 9 ? "r" : "c");
  }
  for (let y = 18; y <= 19; y++) p.row(y, cx, 6, "r");
  for (let y = 20; y <= 29; y++) p.row(y, cx, 6, "c");
  for (let y = 30; y <= 31; y++) p.row(y, cx, 6, "m", y - 30); // interstage
  for (let y = 32; y <= 71; y++) {
    const mat = y >= 48 && y <= 50 ? "r" : "c";
    p.row(y, cx, 6, mat, y === 40 || y === 62 ? 1 : 0); // panel seams
  }
  for (let y = 72; y <= 73; y++) p.row(y, cx, 6, "m", 1);
  [3, 3, 4, 4, 5].forEach((h, i) => p.row(74 + i, cx, h, "m", i === 4 ? 1 : 0));
  // Porthole: metal ring, glass, glint.
  for (let y = 21; y <= 28; y++) {
    for (let x = 18; x <= 26; x++) {
      const d = Math.hypot(x - cx, y - 24.5);
      if (d <= 3.6) p.set(x, y, d > 2.6 ? "m2" : x < cx && y < 24 ? "N" : "n");
    }
  }
  // Mission emblem: a little teal badge with a cream star pixel.
  for (let y = 54; y <= 58; y++) for (let x = 18; x <= 21; x++) p.set(x, y, x === 21 || y === 58 ? "e3" : "e2");
  p.set(19, 56, "c0");
  // Vertical weld line on the shaded side.
  for (let y = 33; y <= 70; y += 3) p.set(26, y, "c4");
  return p;
}

function finPart(side) {
  const p = new Part();
  for (let y = 60; y <= 73; y++) {
    const reach = Math.min(4, Math.floor((y - 58) / 3));
    for (let i = 0; i <= reach; i++) p.set(side < 0 ? 15 - i : 29 + i, y, i === reach ? "r3" : "r2");
  }
  return p;
}

function rocketFrames() {
  return ["L", "l"].map((light) => {
    const g = new Grid(44, 80);
    finPart(-1).stamp(g);
    finPart(1).stamp(g);
    for (const y of [41, 64]) { // struts tying boosters to the core
      for (const x of [12, 13, 14, 30, 31, 32]) g.px(x, y, "m3");
    }
    booster(8).stamp(g);
    booster(36).stamp(g);
    coreStage().stamp(g);
    g.px(22, 0, light); // nav light at the tip
    return g;
  });
}

// Engine flames for the world launch: 44x26, three flickering plumes under the bells.
function flameFrames() {
  const lengths = [[13, 21, 12], [16, 25, 15], [12, 19, 14]];
  return lengths.map((lens, f) => {
    const g = new Grid(44, 26);
    [8, 22, 36].forEach((cx, e) => {
      const len = lens[e], w0 = e === 1 ? 4 : 3;
      for (let y = 0; y < len; y++) {
        const half = w0 * (1 - Math.pow(y / len, 1.4)) + (y < 2 ? 0.5 : 0);
        for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
          const r = Math.abs(x - cx) / Math.max(half, 0.5) + y / len * 0.6;
          g.px(x, y, r < 0.35 ? "f0" : r < 0.65 ? "f1" : r < 0.9 ? "f2" : "f3");
        }
      }
      g.px(cx + ((f + e) % 3) - 1, len + 1, "f1"); // stray spark
    });
    return g;
  });
}

// Close canvases left over from a previous run so re-running doesn't pile up tabs.
async function closeCanvasesNamed(name) {
  const { canvases } = await cmd("list_canvases");
  const stale = canvases.filter((c) => c.name === name).map((c) => c.index).reverse();
  for (const index of stale) await cmd("close_canvas", { index });
}

async function paintSprite({ name, w, h, frames, columns, fps }) {
  await cmd("create_canvas", { name: `${name}-new`, width: w, height: h });
  await closeCanvasesNamed(name);
  await cmd("switch_canvas", { name: `${name}-new` });
  await cmd("rename_canvas", { name });
  for (let i = 1; i < frames.length; i++) await cmd("add_frame", { after_frame: i - 1 });
  for (let i = 0; i < frames.length; i++) {
    await cmd("draw_pixels_fast", { frame: i, layer: 0, data: frames[i].flat() });
  }
  await cmd("set_fps", { fps });
  const sheet = await cmd("export_animation", {
    path: toPx(SPRITE_DIR), prefix: name, mode: "spritesheet", columns,
  });
  const saved = await cmd("save_project", { path: toPx(path.join(ART_DIR, `${name}.pxo`)) });
  await cmd("fit_viewport");
  console.log(`${name}: ${sheet.path} (${sheet.frames} frames, ${sheet.columns}x${sheet.rows}) + ${saved.path}`);
}

const health = await fetch(`${BRIDGE}/health`).then((r) => r.json()).catch(() => null);
if (!health || health.status !== "ok") {
  console.error("Pixelorama bridge not reachable on :7373 - open Pixelorama with the pix-MCP Bridge extension enabled.");
  process.exit(1);
}
const SPRITES = [
  { name: "player", w: W, h: H, frames: playerFrames(), columns: 4, fps: 8 },
  { name: "marker", w: 12, h: 14, frames: markerFrames(), columns: 4, fps: 6 },
  { name: "dish", w: 24, h: 28, frames: dishFrames(), columns: 4, fps: 4 },
  { name: "workbench", w: 32, h: 24, frames: workbenchFrames(), columns: 5, fps: 8 },
  { name: "fuel_tanks", w: 28, h: 32, frames: fuelTankFrames(), columns: 4, fps: 4 },
  { name: "rocket", w: 44, h: 80, frames: rocketFrames(), columns: 2, fps: 2 },
  { name: "rocket_flame", w: 44, h: 26, frames: flameFrames(), columns: 3, fps: 14 },
];
// Optional names on the command line redraw only those sprites, e.g. `node art/draw_assets.mjs dish`.
const only = process.argv.slice(2);
for (const sprite of SPRITES) {
  if (only.length === 0 || only.includes(sprite.name)) await paintSprite(sprite);
}
