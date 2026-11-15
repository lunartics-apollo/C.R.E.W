// Academy campus hub: the cadet walks (WASD / arrows / tap) to the building where the next chapter happens.
import Phaser from 'phaser';
import { BASE_H, BASE_W, bridge } from '../bridge';
import { makeTextures } from '../textures';
import { DOOR_Y, NEAR_RADIUS, SPOTS, WALK_MAX_Y, WALK_MIN_Y, spotForPhase, type Spot } from '../stationMap';
import { translate } from '../../i18n';
import { useStore } from '../../state/store';
import { mulberry32 } from '../../simulation/rng';

const INK = 0x1c1622;
const CREAM = 0xfff4dc;
const GOLD = 0xf2c94c;
const SPEED = 72;

type Facing = 'down' | 'up' | 'right';

export class StationScene extends Phaser.Scene {
  private cadet!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'e' | 'enter' | 'space', Phaser.Input.Keyboard.Key>;
  private target: Phaser.Math.Vector2 | null = null;
  private autoEnter: Spot | null = null;
  private near: Spot | null = null;
  private facing: Facing = 'down';
  private arrow!: Phaser.GameObjects.Image;
  private reduced = false;
  private unsubStore: (() => void) | null = null;
  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  };

  constructor() {
    super('station');
  }

  preload() {
    if (!this.textures.exists('cadet')) this.load.spritesheet('cadet', 'ui/crew/nova.png', { frameWidth: 20, frameHeight: 26 });
  }

  create() {
    makeTextures(this);
    this.reduced = useStore.getState().settings.reducedMotion;
    this.near = null;
    this.target = null;
    this.autoEnter = null;
    const locale = useStore.getState().settings.locale;
    this.drawSky();
    this.drawGround();
    const phase = useStore.getState().progress?.phase;
    const active = spotForPhase(phase);
    this.buildControl(46);
    this.buildWorkshop(130);
    this.buildOffice(214);
    this.buildGround(298);
    this.buildLab(372);
    this.buildPad(442);

    // Signs, and a gold marker over the next destination.
    for (const spot of SPOTS) {
      const isNext = active?.id === spot.id;
      const label = this.add.text(spot.x, 80, translate(locale, `hub.spot.${spot.id}`).toUpperCase(), {
        fontFamily: 'Silkscreen, monospace',
        fontSize: '8px',
        color: isNext ? '#fadc78' : '#fff4dc',
        backgroundColor: isNext ? '#7a3b2e' : '#2e3040',
        padding: { x: 3, y: 2 },
      });
      label.setOrigin(0.5).setDepth(2000).setResolution(2);
    }
    const arrowKey = 'hub-arrow';
    if (!this.textures.exists(arrowKey)) {
      const t = this.textures.createCanvas(arrowKey, 11, 9);
      if (t) {
        const c = t.getContext();
        c.fillStyle = '#1c1622';
        c.fillRect(0, 0, 11, 5);
        c.fillRect(2, 5, 7, 2);
        c.fillRect(4, 7, 3, 2);
        c.fillStyle = '#f2c94c';
        c.fillRect(1, 1, 9, 3);
        c.fillRect(3, 4, 5, 2);
        c.fillRect(5, 6, 1, 2);
        t.refresh();
      }
    }
    this.arrow = this.add.image(active?.x ?? -50, 94, arrowKey).setDepth(2000).setVisible(!!active);
    if (active && !this.reduced) this.tweens.add({ targets: this.arrow, y: 100, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // The cadet
    const start = { x: active ? active.x : 240, y: 226 };
    this.shadow = this.add.ellipse(start.x, start.y, 14, 5, 0x000000, 0.35);
    this.cadet = this.add.sprite(start.x, start.y, 'cadet', 0);
    this.cadet.setOrigin(0.5, 1);
    this.makeAnims();

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D', e: 'E', enter: 'ENTER', space: 'SPACE' }) as StationScene['keys'];
    window.addEventListener('keydown', this.onKeyDown);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onTap(p));

    // A new phase changes where the gold marker points.
    this.unsubStore = useStore.subscribe((s, prev) => {
      if (s.progress?.phase !== prev.progress?.phase) this.scene.restart();
    });
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.onKeyDown);
      this.unsubStore?.();
      this.input.off('pointerdown');
      bridge.emit('hubNear', null);
    });
  }

  private makeAnims() {
    const rows: Record<string, number> = { down: 0, up: 1, right: 2 };
    for (const [dir, row] of Object.entries(rows)) {
      const key = `walk-${dir}`;
      if (!this.anims.exists(key)) {
        this.anims.create({ key, frames: this.anims.generateFrameNumbers('cadet', { frames: [1, 2, 3, 4].map((c) => row * 5 + c) }), frameRate: 9, repeat: -1 });
      }
    }
  }

  // ---------------------------------------------------------------- input
  private onTap(p: Phaser.Input.Pointer) {
    const x = p.x;
    const y = p.y;
    // Tapping a building walks to its door and goes in.
    if (y < WALK_MIN_Y) {
      const spot = SPOTS.reduce((best, s) => (Math.abs(s.x - x) < Math.abs(best.x - x) ? s : best), SPOTS[0]!);
      if (Math.abs(spot.x - x) < 40) {
        this.target = new Phaser.Math.Vector2(spot.x, WALK_MIN_Y + 6);
        this.autoEnter = spot;
        return;
      }
    }
    this.autoEnter = null;
    this.target = new Phaser.Math.Vector2(Phaser.Math.Clamp(x, 10, BASE_W - 10), Phaser.Math.Clamp(y, WALK_MIN_Y, WALK_MAX_Y));
  }

  override update(_t: number, dtMs: number) {
    const dt = dtMs / 1000;
    const k = this.keys;
    let dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      this.target = null;
      this.autoEnter = null;
    } else if (this.target) {
      const to = this.target.clone().subtract(new Phaser.Math.Vector2(this.cadet.x, this.cadet.y));
      if (to.length() < 2) {
        this.target = null;
      } else {
        to.normalize();
        dx = to.x;
        dy = to.y;
      }
    }
    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(SPEED * dt);
      this.cadet.x = Phaser.Math.Clamp(this.cadet.x + v.x, 10, BASE_W - 10);
      this.cadet.y = Phaser.Math.Clamp(this.cadet.y + v.y, WALK_MIN_Y, WALK_MAX_Y);
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

    // Which door are we standing at?
    let nearest: Spot | null = null;
    for (const s of SPOTS) if (Math.abs(s.x - this.cadet.x) < NEAR_RADIUS && this.cadet.y < DOOR_Y + 46) nearest = s;
    if (nearest?.id !== this.near?.id) {
      this.near = nearest;
      bridge.emit('hubNear', nearest?.id ?? null);
    }
    const pressed = Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.enter) || Phaser.Input.Keyboard.JustDown(k.space);
    if (this.near && (pressed || (this.autoEnter?.id === this.near.id && !this.target))) {
      this.autoEnter = null;
      this.tryEnter(this.near);
    }
  }

  private tryEnter(spot: Spot) {
    const phase = useStore.getState().progress?.phase;
    bridge.emit('hubTry', { id: spot.id, ok: !!phase && spot.phases.includes(phase) });
  }

  // ---------------------------------------------------------------- art
  private drawSky() {
    const g = this.add.graphics().setDepth(-100);
    const bands = [0x1c1622, 0x241d2c, 0x2e2538, 0x3a2c44, 0x4a3450, 0x5e3f58, 0x7a4a5c];
    const bandH = 150 / bands.length;
    bands.forEach((col, i) => {
      g.fillStyle(col, 1).fillRect(0, Math.floor(i * bandH), BASE_W, Math.ceil(bandH) + 1);
      const next = bands[i + 1];
      if (next !== undefined) {
        g.fillStyle(next, 1);
        const y0 = Math.floor((i + 1) * bandH) - 3;
        for (let x = 0; x < BASE_W; x += 2) g.fillRect(x + ((x / 2) % 2), y0 + ((x / 2) % 2), 1, 1);
      }
    });
    const rnd = mulberry32(7);
    for (let i = 0; i < 70; i++) {
      const s = this.add.image(Math.floor(rnd() * BASE_W), Math.floor(rnd() * 70), 'px').setDepth(-99);
      s.setTint(rnd() < 0.25 ? GOLD : CREAM).setAlpha(0.3 + rnd() * 0.6);
      if (!this.reduced && rnd() < 0.3) this.tweens.add({ targets: s, alpha: 0.1, duration: 900 + rnd() * 2000, yoyo: true, repeat: -1, delay: rnd() * 2000 });
    }
    const moon = this.add.graphics().setDepth(-98);
    moon.fillStyle(0xfff2c8, 0.1).fillCircle(410, 30, 20).fillStyle(0xf4ecd4, 1).fillCircle(410, 30, 10).fillStyle(0xd9cfb4, 1).fillRect(406, 27, 2, 2).fillRect(412, 32, 3, 2);
    this.add.tileSprite(0, 80, BASE_W, 60, 'ridge-far').setOrigin(0, 0).setTint(0x4a3a5c).setDepth(-90);
    this.add.tileSprite(0, 108, BASE_W, 60, 'ridge-mid').setOrigin(0, 0).setTint(0x2e2538).setDepth(-89);
  }

  private drawGround() {
    const g = this.add.graphics().setDepth(-50);
    g.fillStyle(0x2c3a34, 1).fillRect(0, 158, BASE_W, 30);
    g.fillStyle(0x34463e, 1);
    for (let x = 0; x < BASE_W; x += 6) g.fillRect(x, 160 + ((x * 7) % 9), 2, 1);
    g.fillStyle(0x565a74, 1).fillRect(0, 186, BASE_W, 76);
    g.fillStyle(0x4a4e66, 1);
    for (let y = 198; y < 262; y += 12) g.fillRect(0, y, BASE_W, 1);
    g.fillStyle(0x1c1622, 1).fillRect(0, 185, BASE_W, 1);
    g.fillStyle(0x6a6e88, 1).fillRect(0, 186, BASE_W, 1);
    g.fillStyle(0xf2c94c, 0.35);
    for (let x = 8; x < BASE_W; x += 14) g.fillRect(x, 222, 7, 1);
    g.fillStyle(0x1c1622, 1).fillRect(0, 262, BASE_W, BASE_H - 262);
  }

  private box(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number, light: number) {
    g.fillStyle(INK, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(fill, 1).fillRect(x, y, w, h);
    g.fillStyle(light, 1).fillRect(x, y, w, 1);
  }

  private door(g: Phaser.GameObjects.Graphics, cx: number, wide = 12) {
    const y = DOOR_Y + 4 - 15;
    g.fillStyle(INK, 1).fillRect(cx - wide / 2 - 1, y - 1, wide + 2, 17);
    g.fillStyle(0xfadc78, 0.9).fillRect(cx - wide / 2, y, wide, 16);
    g.fillStyle(0x7a3b2e, 1).fillRect(cx - wide / 2, y, wide, 2);
  }

  private windows(g: Phaser.GameObjects.Graphics, x: number, y: number, n: number, color = 0xfadc78) {
    for (let i = 0; i < n; i++) {
      g.fillStyle(INK, 1).fillRect(x + i * 12 - 1, y - 1, 8, 8);
      g.fillStyle(color, 1).fillRect(x + i * 12, y, 6, 6);
    }
  }

  private buildControl(cx: number) {
    const g = this.add.graphics().setDepth(10);
    this.box(g, cx - 30, 120, 60, 60, 0x565a74, 0x8088a8);
    this.box(g, cx - 34, 114, 68, 8, 0x3a3c52, 0x565a74);
    g.fillStyle(INK, 1).fillRect(cx + 16, 90, 2, 24).fillRect(cx + 12, 96, 10, 1).fillRect(cx + 13, 102, 8, 1);
    g.fillStyle(0xe5604d, 1).fillRect(cx + 16, 88, 2, 2);
    this.windows(g, cx - 24, 128, 2, 0x7fc8a0);
    this.windows(g, cx - 24, 144, 2, 0xfadc78);
    this.door(g, cx);
  }

  private buildWorkshop(cx: number) {
    const g = this.add.graphics().setDepth(10);
    this.box(g, cx - 36, 130, 72, 50, 0xc47454, 0xe09470);
    g.fillStyle(INK, 1).fillRect(cx - 40, 125, 80, 6);
    g.fillStyle(0x964a34, 1).fillRect(cx - 39, 126, 78, 4);
    this.windows(g, cx - 30, 138, 1);
    this.windows(g, cx + 18, 138, 1);
    this.door(g, cx, 22);
    g.fillStyle(INK, 1).fillRect(cx - 5, 134, 10, 10).fillStyle(0xfff4dc, 1).fillRect(cx - 4, 135, 8, 8).fillStyle(0x3a3c52, 1).fillRect(cx - 2, 137, 4, 4);
  }

  private buildOffice(cx: number) {
    const g = this.add.graphics().setDepth(10);
    this.box(g, cx - 28, 128, 56, 52, 0xe8d9b5, 0xfff4dc);
    g.fillStyle(INK, 1).fillRect(cx - 32, 121, 64, 7);
    g.fillStyle(0x964a34, 1).fillRect(cx - 31, 122, 62, 5);
    this.windows(g, cx - 20, 136, 3, 0x7fc8a0);
    this.door(g, cx);
    g.lineStyle(1, 0x2a2230, 1).strokeEllipse(cx, 156, 22, 8);
  }

  private buildGround(cx: number) {
    const g = this.add.graphics().setDepth(10);
    this.box(g, cx - 24, 144, 48, 36, 0x3a3c52, 0x565a74);
    this.windows(g, cx - 16, 152, 2, 0x8fdcff);
    this.door(g, cx);
    const dish = this.add.graphics().setDepth(11);
    dish.fillStyle(INK, 1).fillRect(cx - 1, 124, 3, 20);
    dish.fillStyle(0xe8d9b5, 1).fillTriangle(cx - 16, 112, cx + 16, 112, cx, 126);
    dish.lineStyle(1, INK, 1).strokeTriangle(cx - 16, 112, cx + 16, 112, cx, 126);
    dish.fillStyle(0xe5604d, 1).fillRect(cx - 1, 104, 2, 8);
  }

  private buildLab(cx: number) {
    const g = this.add.graphics().setDepth(10);
    this.box(g, cx - 26, 130, 52, 50, 0x3a3c52, 0x565a74);
    g.fillStyle(INK, 1).fillRect(cx - 30, 124, 60, 6);
    g.fillStyle(0x5a8a78, 1).fillRect(cx - 29, 125, 58, 4);
    this.windows(g, cx - 18, 138, 2, 0x9fd6a5);
    this.door(g, cx);
    g.fillStyle(INK, 1).fillRect(cx + 26, 150, 14, 30).fillStyle(0xd6c4a8, 1).fillRect(cx + 27, 151, 12, 28).fillStyle(0xa8947c, 1).fillRect(cx + 27, 151, 3, 28);
  }

  private buildPad(cx: number) {
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(INK, 1).fillRect(cx - 30, 176, 58, 6).fillStyle(0x8a7464, 1).fillRect(cx - 29, 177, 56, 4);
    // service tower with cross braces
    g.fillStyle(INK, 1).fillRect(cx - 26, 100, 3, 76).fillRect(cx - 16, 100, 3, 76);
    for (let y = 104; y < 176; y += 12) g.fillRect(cx - 26, y, 13, 1).fillTriangle(cx - 26, y, cx - 13, y + 12, cx - 26, y + 12);
    g.fillStyle(0xe5604d, 1).fillRect(cx - 26, 96, 13, 4);
    // rocket
    g.fillStyle(INK, 1).fillRect(cx - 2, 104, 20, 73);
    g.fillStyle(0xfff4dc, 1).fillRect(cx - 1, 108, 18, 68).fillStyle(0xd6c4a8, 1).fillRect(cx + 11, 108, 5, 68);
    g.fillStyle(INK, 1).fillTriangle(cx - 2, 108, cx + 18, 108, cx + 8, 86);
    g.fillStyle(0xe5604d, 1).fillTriangle(cx, 107, cx + 16, 107, cx + 8, 90);
    g.fillStyle(INK, 1).fillCircle(cx + 8, 124, 5).fillStyle(0x8fdcff, 1).fillCircle(cx + 8, 124, 4);
    g.fillStyle(0xe5604d, 1).fillRect(cx - 1, 160, 18, 6);
    g.fillStyle(INK, 1).fillTriangle(cx - 2, 177, cx - 11, 177, cx - 2, 158).fillTriangle(cx + 18, 177, cx + 27, 177, cx + 18, 158);
    this.door(g, cx - 6, 8);
    if (!this.reduced) {
      const blink = this.add.rectangle(cx - 24, 94, 3, 3, 0xe5604d).setDepth(11);
      this.tweens.add({ targets: blink, alpha: 0.15, duration: 600, yoyo: true, repeat: -1 });
    }
  }
}
