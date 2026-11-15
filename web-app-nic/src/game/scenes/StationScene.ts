// The C.R.E.W. ground station from the Godot game: the cadet walks room to room (WASD / arrows / tap-to-walk
// with A* pathfinding) to the spot where the current chapter happens.
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

const SHEETS: Record<string, { file: string; w: number; h: number; frames: number; fps: number }> = {
  dish: { file: 'map/dish_spritesheet.png', w: 24, h: 28, frames: 4, fps: 4 },
  workbench: { file: 'map/workbench_spritesheet.png', w: 32, h: 24, frames: 4, fps: 8 },
  fuel_tanks: { file: 'map/fuel_tanks_spritesheet.png', w: 28, h: 32, frames: 4, fps: 4 },
  rocket: { file: 'map/rocket_spritesheet.png', w: 44, h: 80, frames: 2, fps: 2 },
};

export class StationScene extends Phaser.Scene {
  private cadet!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'e' | 'enter' | 'space', Phaser.Input.Keyboard.Key>;
  private path: Vec[] = [];
  private autoUse: Spot | null = null;
  private near: Spot | null = null;
  private roomId = '';
  private facing: Facing = 'down';
  private marker: Phaser.GameObjects.Graphics | null = null;
  private reduced = false;
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
    for (const [key, s] of Object.entries(SHEETS)) if (!this.textures.exists(`st-${key}`)) L.spritesheet(`st-${key}`, s.file, { frameWidth: s.w, frameHeight: s.h });
  }

  create() {
    const map = stationMap();
    this.reduced = useStore.getState().settings.reducedMotion;
    this.near = null;
    this.path = [];
    this.autoUse = null;
    this.roomId = '';
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

    // The cadet starts at the door of the current chapter's room, or in the corridor.
    const target = map.spotForPhase(useStore.getState().progress?.phase);
    const start = this.startPoint(target);
    this.shadow = this.add.ellipse(start.x, start.y, 14, 5, 0x000000, 0.3);
    this.cadet = this.add.sprite(start.x, start.y, 'cadet', 0).setOrigin(0.5, 1);
    for (const [dir, row] of Object.entries({ down: 0, up: 1, right: 2 })) {
      const key = `walk-${dir}`;
      if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers('cadet', { frames: [1, 2, 3, 4].map((c) => row * 5 + c) }), frameRate: 9, repeat: -1 });
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W, MAP_H);
    cam.startFollow(this.cadet, true, 0.2, 0.2);
    cam.centerOn(start.x, start.y);

    this.drawMarker(target);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D', e: 'E', enter: 'ENTER', space: 'SPACE' }) as StationScene['keys'];
    window.addEventListener('keydown', this.onKeyDown);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));
    bridge.walkTo = (x, y) => {
      this.autoUse = null;
      this.path = stationMap().findPath({ x: this.cadet.x, y: this.cadet.y }, { x, y });
    };
    this.unsubStore = useStore.subscribe((s, prev) => {
      if (s.progress?.phase !== prev.progress?.phase) this.drawMarker(map.spotForPhase(s.progress?.phase));
    });
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.onKeyDown);
      this.unsubStore?.();
      this.input.off('pointerdown');
      bridge.playerPos = null;
      bridge.walkTo = null;
      bridge.emit('hubNear', null);
    });
  }

  private startPoint(target: Spot | null): Vec {
    const map = stationMap();
    const saved = bridge.playerPos;
    if (saved && !map.isBlocked(saved)) return { ...saved };
    void target;
    return { ...map.spawn };
  }

  private animatedProp(name: string, x: number, y: number) {
    const s = SHEETS[name]!;
    const key = `st-${name}-loop`;
    if (!this.anims.exists(key)) this.anims.create({ key, frames: this.anims.generateFrameNumbers(`st-${name}`, { frames: Array.from({ length: s.frames }, (_, i) => i) }), frameRate: s.fps, repeat: -1 });
    const sprite = this.add.sprite(x, y + 2, `st-${name}`, 0).setOrigin(0.5, 1).setDepth(y);
    if (name === 'workbench') sprite.play(key);
    else if (!this.reduced) sprite.play(key);
  }

  /** A bobbing gold arrow over the spot where the next chapter happens. */
  private drawMarker(target: Spot | null) {
    this.marker?.destroy();
    this.marker = null;
    if (!target) return;
    const g = this.add.graphics().setDepth(9000);
    g.fillStyle(0x1c1622, 1).fillRect(-6, 0, 12, 6).fillRect(-4, 6, 8, 3).fillRect(-2, 9, 4, 3);
    g.fillStyle(0xf2c94c, 1).fillRect(-5, 1, 10, 4).fillRect(-3, 5, 6, 2).fillRect(-1, 7, 2, 3);
    g.setPosition(target.pos.x, target.pos.y - 30);
    if (!this.reduced) this.tweens.add({ targets: g, y: target.pos.y - 24, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.marker = g;
  }

  // ---------------------------------------------------------------- input
  private onTap(p: Phaser.Input.Pointer) {
    const map = stationMap();
    const dest = { x: p.worldX, y: p.worldY };
    // Tapping a spot walks to it and uses it on arrival.
    const spot = [...map.spots.values()].find((s) => Math.hypot(s.pos.x - dest.x, s.pos.y - dest.y) < 22) ?? null;
    this.autoUse = spot;
    this.path = map.findPath({ x: this.cadet.x, y: this.cadet.y }, spot ? spot.pos : dest);
  }

  override update(_t: number, dtMs: number) {
    const map = stationMap();
    const dt = Math.min(dtMs, 50) / 1000;
    const k = this.keys;
    let dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
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
      this.cadet.anims.play(`walk-${this.facing}`, true);
    } else {
      this.cadet.anims.stop();
      this.cadet.setFrame({ down: 0, up: 5, right: 10 }[this.facing]);
    }
    this.cadet.setDepth(this.cadet.y);
    this.shadow.setPosition(this.cadet.x, this.cadet.y - 1).setDepth(this.cadet.y - 1);
    bridge.playerPos = { x: this.cadet.x, y: this.cadet.y };

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
    const pressed = this.useRequested;
    this.useRequested = false;
    if (this.near && (pressed || (this.autoUse?.id === this.near.id && this.path.length === 0))) {
      this.autoUse = null;
      this.path = [];
      const target = map.spotForPhase(useStore.getState().progress?.phase);
      bridge.emit('hubTry', { id: this.near.id, ok: target?.id === this.near.id });
    }
  }
}
