// Parallax Sarawak night scene: rainforest ridges, the Rajang, a longboat, fireflies,
// a tracking ground-station dish and our CubeSat crossing the sky on an orbit trace.
import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../bridge';
import { makeTextures } from '../textures';
import { mulberry32 } from '../../simulation/rng';
import { useStore } from '../../state/store';

export class SkyScene extends Phaser.Scene {
  private layers: { ts: Phaser.GameObjects.TileSprite; speed: number; par: number }[] = [];
  private sat!: Phaser.GameObjects.Image;
  private satTrail!: Phaser.GameObjects.Graphics;
  private dish!: Phaser.GameObjects.Graphics;
  private beam!: Phaser.GameObjects.Graphics;
  private river!: Phaser.GameObjects.Graphics;
  private rocket!: Phaser.GameObjects.Graphics;
  private dim!: Phaser.GameObjects.Rectangle;
  private boat!: Phaser.GameObjects.Image;
  private t = 0;
  private reduced = false;
  private unsub: (() => void) | null = null;

  constructor() {
    super('sky');
  }

  create() {
    makeTextures(this);
    this.layers = [];
    this.reduced = useStore.getState().settings.reducedMotion;
    const g = this.add.graphics();
    // Dithered sky gradient: midnight -> deep teal near the horizon.
    const bands = [0x04060f, 0x060a18, 0x081022, 0x0a162c, 0x0c1d36, 0x0f2640, 0x123048];
    const bandH = 175 / bands.length;
    bands.forEach((col, i) => {
      g.fillStyle(col, 1);
      g.fillRect(0, Math.floor(i * bandH), BASE_W, Math.ceil(bandH) + 1);
      const next = bands[i + 1];
      if (next !== undefined) {
        g.fillStyle(next, 1);
        const y0 = Math.floor((i + 1) * bandH) - 3;
        for (let x = 0; x < BASE_W; x += 2) g.fillRect(x + ((x / 2) % 2), y0 + ((x / 2) % 2), 1, 1);
      }
    });
    const rnd = mulberry32(99);
    for (let i = 0; i < 170; i++) {
      const s = this.add.image(Math.floor(rnd() * BASE_W), Math.floor(rnd() * 150), rnd() < 0.08 ? 'spark' : 'px');
      s.setTint(rnd() < 0.2 ? 0xffd86b : rnd() < 0.4 ? 0x8fdcff : 0xffffff).setAlpha(0.35 + rnd() * 0.65);
      if (!this.reduced && rnd() < 0.35) this.tweens.add({ targets: s, alpha: 0.15, duration: 800 + rnd() * 2500, yoyo: true, repeat: -1, delay: rnd() * 3000 });
    }
    const moon = this.add.graphics();
    moon.fillStyle(0xfff2c8, 0.06).fillCircle(398, 46, 22);
    moon.fillStyle(0xfff2c8, 0.12).fillCircle(398, 46, 15);
    moon.fillStyle(0xf4ecd4, 1).fillCircle(398, 46, 9);
    moon.fillStyle(0xd9cfb4, 1).fillRect(394, 43, 2, 2).fillRect(400, 48, 3, 2).fillRect(397, 50, 1, 1);
    const orbit = this.add.graphics();
    orbit.lineStyle(1, 0x5ad1e6, 0.18);
    orbit.strokeEllipse(240, 150, 560, 190, 80);
    this.satTrail = this.add.graphics();
    this.sat = this.add.image(0, 0, 'sat-icon');

    const mk = (key: string, y: number, speed: number, par: number) => {
      const ts = this.add.tileSprite(0, y, BASE_W, 60, key).setOrigin(0, 0);
      this.layers.push({ ts, speed, par });
    };
    mk('ridge-far', 140, 1.2, 4);
    mk('ridge-mid', 158, 2.6, 8);
    this.river = this.add.graphics();
    mk('ridge-near', 196, 5, 14);
    this.boat = this.add.image(-20, 228, 'boat').setOrigin(0.5, 1);
    const hill = this.add.graphics();
    hill.fillStyle(0x050b16, 1).fillEllipse(70, 222, 150, 46);
    this.beam = this.add.graphics();
    this.dish = this.add.graphics();
    const fg = this.add.graphics();
    fg.fillStyle(0x03070f, 1).fillRect(0, 240, BASE_W, 30);
    const r2 = mulberry32(7);
    for (let x = 0; x < BASE_W; x += 3) {
      const h = 1 + Math.floor(r2() * 4);
      fg.fillRect(x, 240 - h, 1, h);
    }
    this.add.particles(0, 0, 'px', {
      x: { min: 0, max: BASE_W },
      y: { min: 200, max: 250 },
      lifespan: 4000,
      speedX: { min: -4, max: 4 },
      speedY: { min: -3, max: 2 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xd9ff7a, 0xfff08a],
      frequency: this.reduced ? 900 : 160,
      quantity: 1,
    });
    this.rocket = this.add.graphics();
    this.dim = this.add.rectangle(0, 0, BASE_W, BASE_H, 0x03060d, 0).setOrigin(0);
    this.unsub = useStore.subscribe((s, prev) => {
      if (s.progress?.phase !== prev.progress?.phase) this.applyPhase(s.progress?.phase ?? 'menu');
      this.reduced = s.settings.reducedMotion;
    });
    this.events.once('shutdown', () => this.unsub?.());
    this.applyPhase(useStore.getState().progress?.phase ?? 'menu');
  }

  private applyPhase(phase: string) {
    if (!this.dim?.active) return;
    const target = phase === 'menu' ? 0 : phase === 'ground' ? 0.25 : 0.45;
    this.tweens.add({ targets: this.dim, fillAlpha: target, duration: 600 });
  }

  override update(_time: number, delta: number) {
    this.t += delta / 1000;
    const p = this.input.activePointer;
    const px = p ? (p.x - BASE_W / 2) / BASE_W : 0;
    for (const l of this.layers) l.ts.tilePositionX = this.t * (this.reduced ? 0 : l.speed) + px * l.par;
    const a = (this.t * 0.12) % (Math.PI * 2);
    const sx = 240 + Math.cos(a + Math.PI) * 280;
    const sy = 150 + Math.sin(a + Math.PI) * 95;
    this.sat.setPosition(Math.round(sx), Math.round(sy)).setVisible(sy < 165);
    this.satTrail.clear();
    for (let i = 1; i < 26; i++) {
      const aa = a - i * 0.012;
      const tx = 240 + Math.cos(aa + Math.PI) * 280;
      const ty = 150 + Math.sin(aa + Math.PI) * 95;
      if (ty < 165) this.satTrail.fillStyle(0x5ad1e6, 0.5 - i * 0.018).fillRect(Math.round(tx), Math.round(ty), 1, 1);
    }
    // Launch through the clear sky to the left of the menu.
    this.rocket.clear();
    if (!this.reduced) {
      const flight = (this.t % 13) / 13;
      const x = Math.round(75 + flight * 38);
      const y = Math.round(207 - flight * 255);
      const flicker = Math.floor(this.t * 12) % 3;
      const r = this.rocket;

      // Expanding, fading exhaust particles leave a wake instead of a solid column.
      for (let i = 14; i > 0; i--) {
        const age = i / 14;
        const drift = Math.sin(i * 2.4 + this.t * 3) * age * 9;
        const tx = Math.round(x - i * 0.6 + drift);
        const ty = Math.round(y + 15 + i * 3.1);
        const size = 2 + Math.floor(age * 5);
        r.fillStyle(i < 4 ? 0xffc45e : 0x78b9c9, (1 - age) * 0.32);
        r.fillRect(tx - size, ty, size * 2, size);
      }
      // Engine glow, animated flame, and separate booster nozzles.
      r.fillStyle(0xff9d36, 0.12).fillCircle(x, y + 15, 13 + flicker);
      r.fillStyle(0xef5b35, 0.9).fillTriangle(x - 5, y + 11, x + 5, y + 11, x, y + 25 + flicker * 2);
      r.fillStyle(0xffb743, 1).fillTriangle(x - 3, y + 11, x + 3, y + 11, x, y + 21 + flicker);
      r.fillStyle(0xfff2ad, 1).fillTriangle(x - 2, y + 11, x + 2, y + 11, x, y + 17 + flicker);
      r.fillStyle(0x25374d, 1).fillRect(x - 4, y + 9, 8, 4);
      r.fillStyle(0xffa94a, 1).fillRect(x - 3, y + 11, 2, 2).fillRect(x + 1, y + 11, 2, 2);
      // Stepped silhouette, fins, nose, cockpit, and hull markings.
      r.fillStyle(0x162c43, 1).fillRect(x - 5, y - 5, 10, 15);
      r.fillStyle(0xb84c38, 1).fillRect(x - 8, y + 4, 4, 7).fillRect(x + 4, y + 4, 4, 7);
      r.fillStyle(0xf48c4b, 1).fillRect(x - 7, y + 5, 2, 4).fillRect(x + 5, y + 5, 2, 4);
      r.fillStyle(0x91aeb7, 1).fillRect(x - 4, y - 5, 8, 15);
      r.fillStyle(0xf0f4df, 1).fillRect(x - 3, y - 5, 5, 14);
      r.fillStyle(0xffb74a, 1).fillRect(x - 3, y - 8, 6, 3).fillRect(x - 2, y - 11, 4, 3).fillRect(x - 1, y - 13, 2, 2);
      r.fillStyle(0x253c52, 1).fillRect(x - 3, y - 2, 6, 6);
      r.fillStyle(0x55d8e8, 1).fillRect(x - 2, y - 1, 4, 4);
      r.fillStyle(0xd7ffff, 1).fillRect(x - 2, y - 1, 1, 1);
      r.fillStyle(0xe7794c, 1).fillRect(x - 3, y + 6, 5, 1);

      // A distant meteor adds a second, slower beat to the night sky.
      const meteor = (this.t % 9) / 9;
      if (meteor < 0.22) {
        const mx = Math.round(450 - meteor * 210);
        const my = Math.round(28 + meteor * 80);
        r.lineStyle(1, 0x8ce8f3, 0.45).lineBetween(mx, my, mx + 15, my - 6);
        r.fillStyle(0xffffff, 0.9).fillRect(mx, my, 2, 2);
      }
    }
    const ang = Math.atan2(sy - 192, sx - 70);
    this.dish.clear();
    this.dish.fillStyle(0x1b2741, 1).fillRect(68, 192, 4, 10);
    this.dish.fillStyle(0x2a3a5c, 1).fillRect(64, 201, 12, 2);
    const cx = 70 + Math.cos(ang) * 3;
    const cy = 192 + Math.sin(ang) * 3;
    const perp = ang + Math.PI / 2;
    this.dish.lineStyle(2, 0xc9d3e6, 1);
    this.dish.lineBetween(cx + Math.cos(perp) * 7, cy + Math.sin(perp) * 7, cx - Math.cos(perp) * 7, cy - Math.sin(perp) * 7);
    this.dish.fillStyle(0xf2b33d, 1).fillRect(Math.round(cx + Math.cos(ang) * 5), Math.round(cy + Math.sin(ang) * 5), 1, 1);
    this.beam.clear();
    if (sy < 165) {
      const pulse = (Math.sin(this.t * 6) + 1) / 2;
      this.beam.lineStyle(1, 0x5ad1e6, 0.12 + pulse * 0.15);
      this.beam.lineBetween(cx, cy, sx, sy);
    }
    this.river.clear();
    this.river.fillStyle(0x0c2236, 1).fillRect(0, 214, BASE_W, 26);
    this.river.fillStyle(0x10304a, 1).fillRect(0, 214, BASE_W, 2);
    for (let i = 0; i < 40; i++) {
      const x = 380 + Math.sin(i * 12.9 + this.t * (this.reduced ? 0 : 1.7)) * 26;
      const y = 217 + (i % 20);
      this.river.fillStyle(0xbfdcef, 0.25 + ((i * 7) % 10) / 30).fillRect(Math.round(x), y, 2 + (i % 3), 1);
    }
    this.boat.x = ((this.t * (this.reduced ? 0 : 6)) % (BASE_W + 60)) - 30;
  }
}
