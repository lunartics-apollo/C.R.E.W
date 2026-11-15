// The C.R.E.W. ground station from the Godot game: the cadet walks room to room (WASD / arrows / tap-to-walk
// with A* pathfinding) to the spot where the current chapter happens. Ported from the Godot world:
// sliding doors, day/night tint with room and lamp lights, interaction brackets, the objective arrow,
// wandering crewmates and the hornbill fly-by.
import Phaser from 'phaser';
import { bridge } from '../bridge';
import { MAP_H, MAP_W, PLAYER_SPEED, stationMap, type Spot, type Vec } from '../stationMap';
import props from '../../data/station/props.json';
import layout from '../../data/station/layout.json';
import { useStore } from '../../state/store';

type Facing = 'down' | 'up' | 'right';
interface PropItem {
  name: string;
  region: number[];
  position: number[];
  offset: number[];
}
interface Door {
  horizontal: boolean;
  open: number;
  rect: { x: number; y: number; w: number; h: number };
  center: Vec;
  a: Phaser.GameObjects.NineSlice;
  b: Phaser.GameObjects.NineSlice;
}
interface Npc {
  id: string;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  path: Vec[];
  wait: number;
  facing: Facing;
  rng: Phaser.Math.RandomDataGenerator;
  /** Sitting at the meeting table: stays put until the meeting ends. */
  hold: boolean;
}

const SHEETS: Record<string, { file: string; w: number; h: number; frames: number; fps: number }> = {
  dish: { file: 'map/dish_spritesheet.png', w: 24, h: 28, frames: 4, fps: 4 },
  workbench: { file: 'map/workbench_spritesheet.png', w: 32, h: 24, frames: 4, fps: 8 },
  fuel_tanks: { file: 'map/fuel_tanks_spritesheet.png', w: 28, h: 32, frames: 4, fps: 4 },
  rocket: { file: 'map/rocket_spritesheet.png', w: 44, h: 80, frames: 2, fps: 2 },
};
const CREW = ['orion', 'juno', 'kai'] as const;
// Scene 2: the team meeting at the Mess Hall table (the Godot map's meeting table is at 778,758 64x44).
const SEATS: Record<string, { x: number; y: number; face: Facing; flip: boolean }> = {
  aisyah: { x: 810, y: 813, face: 'up', flip: false },
  orion: { x: 760, y: 790, face: 'right', flip: false }, // Jabu
  juno: { x: 862, y: 790, face: 'right', flip: true }, // Siti
  kai: { x: 810, y: 752, face: 'down', flip: false }, // Ling
};
// Same table as the Godot world: hour -> tint colour, blended between neighbours.
const NIGHT_TINT: [number, number][] = [
  [0, 0x4d5a8c],
  [5, 0x5c6796],
  [7, 0xe9dccb],
  [9, 0xffffff],
  [16, 0xffffff],
  [18, 0xf2c9a0],
  [20, 0x7d79a6],
  [22, 0x4d5a8c],
  [24, 0x4d5a8c],
];
const MINUTES_PER_SECOND = 2;
const OPEN_RANGE = 34;

function lerpColor(a: number, b: number, t: number): number {
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(a), Phaser.Display.Color.ValueToColor(b), 100, t * 100);
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
}
export function tintForHour(hour: number): number {
  for (let k = 0; k < NIGHT_TINT.length - 1; k++) {
    const [h0, c0] = NIGHT_TINT[k]!;
    const [h1, c1] = NIGHT_TINT[k + 1]!;
    if (hour >= h0 && hour <= h1) return lerpColor(c0, c1, (hour - h0) / (h1 - h0));
  }
  return 0xffffff;
}

export class StationScene extends Phaser.Scene {
  private cadet!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private path: Vec[] = [];
  private autoUse: Spot | null = null;
  private near: Spot | null = null;
  private roomId = '';
  private facing: Facing = 'down';
  private arrow: Phaser.GameObjects.Image | null = null;
  private edgeArrow!: Phaser.GameObjects.Image;
  private brackets!: Phaser.GameObjects.Graphics;
  private doors: Door[] = [];
  private npcs: Npc[] = [];
  private tint!: Phaser.GameObjects.Rectangle;
  private nightLights: { img: Phaser.GameObjects.Image; base: number }[] = [];
  private reduced = false;
  private meeting = false;
  private unsubMeeting: (() => void) | null = null;
  private unsubStore: (() => void) | null = null;
  private useRequested = false;
  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (!e.repeat && ['e', 'E', 'Enter', ' '].includes(e.key) && !(e.target instanceof HTMLButtonElement)) this.useRequested = true;
  };

  constructor() {
    super('station');
  }

  preload() {
    const L = this.load;
    if (!this.textures.exists('station-bg')) L.image('station-bg', 'map/space_center.png');
    if (!this.textures.exists('station-props')) L.image('station-props', 'map/props.png');
    if (!this.textures.exists('cadet')) L.spritesheet('cadet', 'ui/crew/nova.png', { frameWidth: 20, frameHeight: 26 });
    for (const id of CREW) if (!this.textures.exists(`crew-${id}`)) L.spritesheet(`crew-${id}`, `ui/crew/${id}.png`, { frameWidth: 20, frameHeight: 26 });
    if (!this.textures.exists('st-door')) L.image('st-door', 'ui/door.png');
    if (!this.textures.exists('st-light')) L.image('st-light', 'ui/light.png');
    if (!this.textures.exists('st-arrow')) L.image('st-arrow', 'ui/arrow.png');
    for (const [key, s] of Object.entries(SHEETS)) if (!this.textures.exists(`st-${key}`)) L.spritesheet(`st-${key}`, s.file, { frameWidth: s.w, frameHeight: s.h });
  }

  create() {
    const map = stationMap();
    this.reduced = useStore.getState().settings.reducedMotion;
    this.near = null;
    this.path = [];
    this.autoUse = null;
    this.roomId = '';
    this.meeting = useStore.getState().progress?.phase === 'meeting';
    if (this.meeting) {
      // A new game: start the day at 08:00 with everyone where the story puts them.
      bridge.clock.day = 1;
      bridge.clock.minutes = 480;
      bridge.crewSaved = {};
      bridge.playerPos = null;
    }
    this.doors = [];
    this.npcs = [];
    this.nightLights = [];
    this.add.image(0, 0, 'station-bg').setOrigin(0, 0).setDepth(-1000);

    // Furniture from the Godot interior atlas, depth-sorted by its base line.
    const atlas = this.textures.get('station-props');
    for (const item of props as PropItem[]) {
      if (!atlas.has(item.name)) atlas.add(item.name, 0, item.region[0]!, item.region[1]!, item.region[2]!, item.region[3]!);
      this.add.image(item.position[0]! + item.offset[0]!, item.position[1]! + item.offset[1]!, 'station-props', item.name).setOrigin(0, 0).setDepth(item.position[1]!);
    }
    // Animated props: satellite dish, workbench, fuel tanks and the rocket.
    for (const [name, p] of Object.entries(layout.props)) this.animatedProp(name, p.pos[0]!, p.pos[1]!);
    this.animatedProp('rocket', map.rocketPos.x, map.rocketPos.y - 1);
    this.buildDoors();

    // The cadet (Aisyah's sprite from the Godot game) starts in the main corridor.
    const target = map.spotForPhase(useStore.getState().progress?.phase);
    const saved = bridge.playerPos;
    const seat = SEATS['aisyah']!;
    const start = this.meeting ? { x: seat.x, y: seat.y } : saved && !map.isBlocked(saved) ? { ...saved } : { ...map.spawn };
    this.shadow = this.add.ellipse(start.x, start.y, 14, 5, 0x000000, 0.3);
    this.cadet = this.add.sprite(start.x, start.y, 'cadet', this.meeting ? 5 : 0).setOrigin(0.5, 1);
    if (this.meeting) this.facing = seat.face;
    for (const [dir, row] of Object.entries({ down: 0, up: 1, right: 2 })) {
      for (const sheet of ['cadet', ...CREW.map((c) => `crew-${c}`)]) {
        const key = `${sheet}-walk-${dir}`;
        if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(sheet, { frames: [1, 2, 3, 4].map((c) => row * 5 + c) }), frameRate: 9, repeat: -1 });
      }
    }
    this.buildCrew();

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W, MAP_H);
    cam.startFollow(this.cadet, true, 0.2, 0.2);
    cam.centerOn(start.x, start.y);

    this.brackets = this.add.graphics().setDepth(9000);
    this.drawArrow(target);
    // The second arrow: sits on the screen edge and points toward the objective when it is off-screen.
    this.edgeArrow = this.add.image(0, 0, 'st-arrow').setScrollFactor(0).setDepth(9100).setVisible(false);
    this.buildNight();
    if (!this.reduced && !this.meeting) this.hornbill();
    // When the meeting dialogue ends, the crew leave the table for their own stations.
    this.unsubMeeting = bridge.on('meetingEnd', () => {
      for (const n of this.npcs) {
        const room = stationMap().rooms.find((r) => r.id === layout.posts[n.id as keyof typeof layout.posts]);
        n.hold = false;
        n.wait = 4 + n.rng.frac() * 4;
        if (room) n.path = stationMap().findPath({ x: n.sprite.x, y: n.sprite.y }, this.randomPoint(room.floorRect, n.rng));
      }
    });

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D' }) as StationScene['keys'];
    window.addEventListener('keydown', this.onKeyDown);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));
    bridge.walkTo = (x, y) => {
      this.autoUse = null;
      this.path = stationMap().findPath({ x: this.cadet.x, y: this.cadet.y }, { x, y });
    };
    this.unsubStore = useStore.subscribe((s, prev) => {
      if (s.progress?.phase !== prev.progress?.phase) {
        this.meeting = s.progress?.phase === 'meeting';
        this.drawArrow(map.spotForPhase(s.progress?.phase));
      }
    });
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.onKeyDown);
      this.unsubStore?.();
      this.unsubMeeting?.();
      this.input.off('pointerdown');
      // Keep playerPos and the crew where they stood, so you come back to the same place after a chapter.
      for (const n of this.npcs) bridge.crewSaved[n.id] = { x: n.sprite.x, y: n.sprite.y };
      bridge.walkTo = null;
      bridge.crew = [];
      bridge.emit('hubNear', null);
    });
  }

  // ---------------------------------------------------------------- world pieces
  private animatedProp(name: string, x: number, y: number) {
    const s = SHEETS[name]!;
    const key = `st-${name}-loop`;
    if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(`st-${name}`, { frames: Array.from({ length: s.frames }, (_, i) => i) }), frameRate: s.fps, repeat: -1 });
    const sprite = this.add.sprite(x, y + 2, `st-${name}`, 0).setOrigin(0.5, 1).setDepth(y);
    if (name === 'workbench' || !this.reduced) sprite.play(key);
  }

  /** Sliding doors: two metal panels in every doorway's wall gap that slide apart when anyone walks up. */
  private buildDoors() {
    const map = stationMap();
    layout.doors.forEach((d) => {
      const r = { x: d.rect[0]!, y: d.rect[1]!, w: d.rect[2]!, h: d.rect[3]! };
      let side = r.w > r.h;
      for (const id of d.between) {
        const room = map.rooms.find((q) => q.id === id);
        if (room) {
          side = r.x + r.w / 2 < room.rect.x || r.x + r.w / 2 > room.rect.x + room.rect.w;
          break;
        }
      }
      const horizontal = !side; // panels slide along x when you walk north/south
      const band = this.wallBand(r, horizontal);
      if (!band) return;
      const mk = () => this.add.nineslice(0, 0, 'st-door', undefined, 8, 8, 2, 2, 2, 2).setOrigin(0, 0).setDepth(band.y + band.h);
      const door: Door = { horizontal, open: 0, rect: band, center: { x: band.x + band.w / 2, y: band.y + band.h / 2 }, a: mk(), b: mk() };
      this.layoutDoor(door);
      this.doors.push(door);
    });
  }

  /** The part of a doorway that crosses the wall (between two rooms, or room and yard). */
  private wallBand(r: { x: number; y: number; w: number; h: number }, horizontal: boolean) {
    const map = stationMap();
    let start = -1;
    let finish = -1;
    const length = Math.floor(horizontal ? r.h : r.w);
    for (let i = 0; i < length; i++) {
      const p = horizontal ? { x: r.x + r.w / 2, y: r.y + i + 0.5 } : { x: r.x + i + 0.5, y: r.y + r.h / 2 };
      const inRoom = map.rooms.some((q) => p.x >= q.rect.x && p.y >= q.rect.y && p.x < q.rect.x + q.rect.w && p.y < q.rect.y + q.rect.h);
      const inFence = p.x >= map.fence.x && p.y >= map.fence.y && p.x < map.fence.x + map.fence.w && p.y < map.fence.y + map.fence.h;
      if (!inRoom && inFence) {
        if (start < 0) start = i;
        finish = i + 1;
      }
    }
    if (start < 0) return null;
    const T = 8;
    if (horizontal) return { x: r.x, y: r.y + start + (finish - start) / 2 - T / 2, w: r.w, h: T };
    return { x: r.x + start + (finish - start) / 2 - T / 2, y: r.y, w: T, h: r.h };
  }

  private layoutDoor(d: Door) {
    const r = d.rect;
    if (d.horizontal) {
      const half = Math.max((r.w / 2) * (1 - d.open), 2);
      d.a.setPosition(r.x, r.y).setSize(half, r.h);
      d.b.setPosition(r.x + r.w - half, r.y).setSize(half, r.h);
    } else {
      const half = Math.max((r.h / 2) * (1 - d.open), 2);
      d.a.setPosition(r.x, r.y).setSize(r.w, half);
      d.b.setPosition(r.x, r.y + r.h - half).setSize(r.w, half);
    }
  }

  /** The other three crewmates potter around their home rooms, like the Godot crew AI. */
  private buildCrew() {
    const map = stationMap();
    CREW.forEach((id, i) => {
      const roomId = layout.posts[id as keyof typeof layout.posts];
      const room = map.rooms.find((r) => r.id === roomId);
      if (!room) return;
      const rng = new Phaser.Math.RandomDataGenerator([`crew-${id}`]);
      const keep = bridge.crewSaved[id];
      const seat = SEATS[id]!;
      const p = this.meeting ? { x: seat.x, y: seat.y } : keep && !map.isBlocked(keep) ? keep : this.randomPoint(room.floorRect, rng);
      const sprite = this.add.sprite(p.x, p.y, `crew-${id}`, this.meeting ? { down: 0, up: 5, right: 10 }[seat.face] : 0).setOrigin(0.5, 1);
      if (this.meeting) sprite.setFlipX(seat.flip);
      const shadow = this.add.ellipse(p.x, p.y, 14, 5, 0x000000, 0.3);
      this.npcs.push({ id, sprite, shadow, path: [], wait: 1 + i, facing: this.meeting ? seat.face : 'down', rng, hold: this.meeting });
    });
  }

  private randomPoint(area: { x: number; y: number; w: number; h: number }, rng: Phaser.Math.RandomDataGenerator): Vec {
    const map = stationMap();
    for (let i = 0; i < 30; i++) {
      const p = { x: area.x + 10 + rng.frac() * (area.w - 20), y: area.y + 10 + rng.frac() * (area.h - 20) };
      if (!map.isBlocked(p)) return p;
    }
    return { x: area.x + area.w / 2, y: area.y + area.h / 2 };
  }

  private updateCrew(dt: number) {
    const map = stationMap();
    for (const n of this.npcs) {
      const roomId = layout.posts[n.id as keyof typeof layout.posts];
      const room = map.rooms.find((r) => r.id === roomId)!;
      if (n.hold) {
        n.sprite.setDepth(n.sprite.y);
        n.shadow.setPosition(n.sprite.x, n.sprite.y - 1).setDepth(n.sprite.y - 1);
        continue;
      }
      if (!n.path.length) {
        n.wait -= dt;
        if (n.wait <= 0) {
          n.wait = 3 + n.rng.frac() * 5;
          n.path = map.findPath({ x: n.sprite.x, y: n.sprite.y }, this.randomPoint(room.floorRect, n.rng));
        }
        n.sprite.anims.stop();
        n.sprite.setFrame({ down: 0, up: 5, right: 10 }[n.facing]);
      } else {
        const wp = n.path[0]!;
        const dx = wp.x - n.sprite.x;
        const dy = wp.y - n.sprite.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 3) {
          n.path.shift();
        } else {
          const step = Math.min(dist, PLAYER_SPEED * 0.8 * dt);
          n.sprite.x += (dx / dist) * step;
          n.sprite.y += (dy / dist) * step;
          if (Math.abs(dx) > Math.abs(dy)) {
            n.facing = 'right';
            n.sprite.setFlipX(dx < 0);
          } else {
            n.facing = dy < 0 ? 'up' : 'down';
            n.sprite.setFlipX(false);
          }
          n.sprite.anims.play(`crew-${n.id}-walk-${n.facing}`, true);
        }
      }
      n.sprite.setDepth(n.sprite.y);
      n.shadow.setPosition(n.sprite.x, n.sprite.y - 1).setDepth(n.sprite.y - 1);
    }
    bridge.crew = this.npcs.map((n) => ({ x: n.sprite.x, y: n.sprite.y, id: n.id }));
  }

  private updateDoors(dt: number) {
    const people: Vec[] = [{ x: this.cadet.x, y: this.cadet.y }, ...this.npcs.map((n) => ({ x: n.sprite.x, y: n.sprite.y }))];
    for (const d of this.doors) {
      const want = people.some((p) => Math.hypot(p.x - d.center.x, p.y - d.center.y) < OPEN_RANGE) ? 1 : 0;
      d.open = Phaser.Math.Clamp(d.open + Math.sign(want - d.open) * dt * 6, 0, 1);
      this.layoutDoor(d);
    }
  }

  /** Day/night: a multiply tint over the world, with warm room and lamp lights that come on at night. */
  private buildNight() {
    const map = stationMap();
    this.tint = this.add.rectangle(0, 0, 480, 270, 0xffffff).setOrigin(0, 0).setScrollFactor(0).setDepth(8000).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const add = (x: number, y: number, scale: number, color: number, energy: number) => {
      const img = this.add.image(x, y, 'st-light').setDepth(8001).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setScale(scale).setAlpha(0).setVisible(false);
      this.nightLights.push({ img, base: energy });
    };
    for (const room of map.rooms) {
      const f = room.floorRect;
      const reach = Math.max(f.w, f.h) * 1.25;
      add(f.x + f.w / 2, f.y + f.h / 2, reach / 64, 0xffe2a8, 0.9);
    }
    for (const l of layout.lamps) add(l[0]!, l[1]! - 6, 1.6, 0xfff1b8, 1);
  }

  private updateNight() {
    const hour = (bridge.clock.minutes / 60) % 24;
    const colour = tintForHour(hour);
    this.tint.setFillStyle(colour);
    const c = Phaser.Display.Color.ValueToColor(colour);
    const v = Math.max(c.red, c.green, c.blue) / 255;
    const dark = Phaser.Math.Clamp((1 - v) * 2.4, 0, 1);
    for (const l of this.nightLights) {
      l.img.setAlpha(l.base * dark * 0.5).setVisible(dark > 0.02);
    }
  }

  /** A small hornbill flies across the screen, like at the start of a Godot mission. */
  private hornbill() {
    const g = this.add.graphics().setScrollFactor(0).setDepth(9500);
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 7,
      duration: 7000,
      onUpdate: () => {
        g.clear();
        const x = -20 + state.t * 78;
        const y = 60 + Math.sin(state.t * 1.6) * 9;
        const wing = Math.sin(state.t * 12) > 0 ? -5 : 4;
        g.fillStyle(0x172630, 1).fillTriangle(x, y + 1, x - 11, y + wing, x + 4, y - 1).fillRect(x - 3, y - 1, 10, 4).fillRect(x + 5, y - 3, 4, 5);
        g.fillStyle(0xfff4dc, 1).fillRect(x - 7, y + 1, 5, 2);
        g.fillStyle(0xe6b65e, 1).fillTriangle(x + 8, y - 2, x + 17, y, x + 8, y + 1);
        g.fillStyle(0xd18042, 1).fillRect(x + 8, y - 4, 5, 2);
        g.fillStyle(0xffffff, 1).fillRect(x + 7, y - 2, 1, 1);
      },
      onComplete: () => g.destroy(),
    });
  }

  /** A bouncing arrow over the spot where the next chapter happens, like the Godot objective pointer. */
  private drawArrow(target: Spot | null) {
    this.arrow?.destroy();
    this.arrow = null;
    if (!target) return;
    const a = this.add.image(target.pos.x, target.pos.y - 34, 'st-arrow').setDepth(9000);
    if (!this.reduced) this.tweens.add({ targets: a, y: target.pos.y - 30, duration: 360, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.arrow = a;
  }

  /** Same as the Godot HUD's off-screen objective arrow: on the screen edge, pointing at the objective, blinking. */
  private updateEdgeArrow(target: Spot | null, time: number) {
    const view = this.cameras.main.worldView;
    if (!target) {
      this.edgeArrow.setVisible(false);
      return;
    }
    const sx = target.pos.x - view.x;
    const sy = target.pos.y - view.y;
    if (sx >= 16 && sx <= 464 && sy >= 16 && sy <= 254) {
      this.edgeArrow.setVisible(false);
      return;
    }
    const cx = 240;
    const cy = 144;
    const len = Math.hypot(sx - cx, sy - cy) || 1;
    const dx = (sx - cx) / len;
    const dy = (sy - cy) / len;
    // Keep the arrow inside the band between the top and bottom HUD.
    const area = { x0: 10, y0: 74, x1: 470, y1: 232 };
    let tt = Infinity;
    if (dx !== 0) tt = Math.min(tt, ((dx > 0 ? area.x1 : area.x0) - cx) / dx);
    if (dy !== 0) tt = Math.min(tt, ((dy > 0 ? area.y1 : area.y0) - cy) / dy);
    this.edgeArrow.setPosition(Math.round(cx + dx * tt), Math.round(cy + dy * tt));
    this.edgeArrow.setRotation(Math.atan2(dy, dx) - Math.PI / 2);
    this.edgeArrow.setVisible(Math.floor(time / 350) % 4 !== 0);
  }

  /** Corner brackets round whatever is in reach: gold = the story needs it, white = optional. */
  private drawBrackets(spot: Spot | null, story: boolean, time: number) {
    const g = this.brackets;
    g.clear();
    if (!spot) return;
    const colour = story ? 0xf2c94c : 0xfff4dc;
    const pulse = 2 + Math.round(Math.sin(time / 150) * 1.5);
    const hx = 10 + pulse;
    const hy = 9 + pulse;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const [off, col] of [[1, 0x1c1622], [0, colour]] as const) {
          const cx = spot.pos.x + hx * sx + off;
          const cy = spot.pos.y + hy * sy + off;
          g.fillStyle(col, 1).fillRect(Math.min(cx, cx - sx * 4), cy, 5, 1).fillRect(cx, Math.min(cy, cy - sy * 4), 1, 5);
        }
      }
    }
  }

  // ---------------------------------------------------------------- input
  private onTap(p: Phaser.Input.Pointer) {
    if (this.meeting) return;
    const map = stationMap();
    const dest = { x: p.worldX, y: p.worldY };
    // Tapping a spot walks to it and uses it on arrival.
    const spot = [...map.spots.values()].find((s) => Math.hypot(s.pos.x - dest.x, s.pos.y - dest.y) < 22) ?? null;
    this.autoUse = spot;
    this.path = map.findPath({ x: this.cadet.x, y: this.cadet.y }, spot ? spot.pos : dest);
  }

  override update(time: number, dtMs: number) {
    const map = stationMap();
    const dt = Math.min(dtMs, 50) / 1000;
    if (!this.meeting) bridge.clock.minutes += dt * MINUTES_PER_SECOND; // the clock starts at 08:00 when you take control
    if (bridge.clock.minutes >= 1440) {
      bridge.clock.minutes -= 1440;
      bridge.clock.day += 1;
    }
    const k = this.keys;
    let dx = this.meeting ? 0 : (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let dy = this.meeting ? 0 : (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (this.meeting) this.path = [];
    if (dx || dy) {
      this.path = [];
      this.autoUse = null;
    } else if (this.path.length) {
      const wp = this.path[0]!;
      const to = { x: wp.x - this.cadet.x, y: wp.y - this.cadet.y };
      const dist = Math.hypot(to.x, to.y);
      if (dist < 3) {
        this.path.shift();
      } else {
        dx = to.x / dist;
        dy = to.y / dist;
      }
    }
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const len = Math.hypot(dx, dy);
      const step = { x: (dx / len) * PLAYER_SPEED * dt, y: (dy / len) * PLAYER_SPEED * dt };
      // Wall sliding: each axis moves on its own, like the Godot game.
      if (!map.isBlocked({ x: this.cadet.x + step.x, y: this.cadet.y })) this.cadet.x += step.x;
      if (!map.isBlocked({ x: this.cadet.x, y: this.cadet.y + step.y })) this.cadet.y += step.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        this.facing = 'right';
        this.cadet.setFlipX(dx < 0);
      } else {
        this.facing = dy < 0 ? 'up' : 'down';
        this.cadet.setFlipX(false);
      }
      this.cadet.anims.play(`cadet-walk-${this.facing}`, true);
    } else {
      this.cadet.anims.stop();
      this.cadet.setFrame({ down: 0, up: 5, right: 10 }[this.facing]);
    }
    this.cadet.setDepth(this.cadet.y);
    this.shadow.setPosition(this.cadet.x, this.cadet.y - 1).setDepth(this.cadet.y - 1);
    bridge.playerPos = { x: this.cadet.x, y: this.cadet.y };
    bridge.playerFacing = this.facing === 'right' ? { x: this.cadet.flipX ? -1 : 1, y: 0 } : { x: 0, y: this.facing === 'up' ? -1 : 1 };

    this.updateCrew(dt);
    this.updateDoors(dt);
    this.updateNight();

    const room = map.roomAt({ x: this.cadet.x, y: this.cadet.y });
    const roomId = room?.id ?? 'outside';
    if (roomId !== this.roomId) {
      this.roomId = roomId;
      bridge.emit('hubRoom', room?.name ?? 'OUTSIDE');
    }
    const nearest = map.spotNear({ x: this.cadet.x, y: this.cadet.y });
    if (nearest?.id !== this.near?.id) {
      this.near = nearest;
      bridge.emit('hubNear', nearest?.id ?? null);
    }
    const objective = map.spotForPhase(useStore.getState().progress?.phase);
    this.drawBrackets(this.near, this.near?.id === objective?.id, time);
    this.updateEdgeArrow(objective, time);

    const pressed = this.useRequested && !this.meeting;
    this.useRequested = false;
    if (this.near && (pressed || (this.autoUse?.id === this.near.id && this.path.length === 0))) {
      this.autoUse = null;
      this.path = [];
      bridge.emit('hubTry', { id: this.near.id, ok: objective?.id === this.near.id });
    }
  }
}
