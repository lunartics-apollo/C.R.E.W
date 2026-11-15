// Skippable launch cinematic: countdown, ignition, ascent, staging, fairing separation,
// dispenser door opening and CubeSat deployment (with the player's actual deployables).
import Phaser from 'phaser';
import { BASE_H, BASE_W, bridge } from '../bridge';
import { makeTextures } from '../textures';
import { getComponent } from '../../simulation/catalog';
import { mulberry32 } from '../../simulation/rng';
import { useStore } from '../../state/store';
import { rumble, play } from '../../audio/sfx';

export class LaunchScene extends Phaser.Scene {
  private t = 0;
  private sky!: Phaser.GameObjects.Graphics;
  private stars!: Phaser.GameObjects.Graphics;
  private rocket!: Phaser.GameObjects.Container;
  private stage1!: Phaser.GameObjects.Image;
  private flame!: Phaser.GameObjects.Image;
  private smoke!: Phaser.GameObjects.Particles.ParticleEmitter;
  private exhaust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private pad!: Phaser.GameObjects.Graphics;
  private space!: Phaser.GameObjects.Graphics;
  private stageEmitted = new Set<string>();
  private reduced = false;
  private done = false;

  constructor() {
    super('launch');
  }

  create() {
    makeTextures(this);
    this.t = 0;
    this.done = false;
    this.stageEmitted = new Set();
    this.reduced = useStore.getState().settings.reducedMotion;
    this.sky = this.add.graphics();
    this.stars = this.add.graphics();
    const rnd = mulberry32(3);
    for (let i = 0; i < 120; i++) this.stars.fillStyle(0xffffff, 0.3 + rnd() * 0.7).fillRect(Math.floor(rnd() * BASE_W), Math.floor(rnd() * BASE_H), 1, 1);
    this.stars.setAlpha(0);
    this.pad = this.add.graphics();
    this.drawPad();
    this.smoke = this.add.particles(240, 224, 'puff', {
      speedX: { min: -70, max: 70 },
      speedY: { min: -25, max: 5 },
      scale: { start: 0.8, end: 2.6 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 2400,
      frequency: 30,
      tint: [0xe6eefc, 0xc0c8d8, 0xffd8a0],
      emitting: false,
    });
    this.stage1 = this.add.image(0, 0, 'rocket');
    this.flame = this.add.image(0, 36, 'flame').setOrigin(0.5, 0).setVisible(false);
    this.rocket = this.add.container(240, 190, [this.flame, this.stage1]);
    this.exhaust = this.add.particles(0, 0, 'px', {
      speedY: { min: 40, max: 90 },
      speedX: { min: -10, max: 10 },
      lifespan: 500,
      tint: [0xffd86b, 0xf2b33d, 0xff8f5d],
      alpha: { start: 1, end: 0 },
      frequency: 12,
      quantity: 3,
      emitting: false,
    });
    this.space = this.add.graphics();
    this.input.keyboard?.on('keydown-ESC', () => this.finish());
  }

  private drawPad() {
    const g = this.pad;
    g.clear();
    g.fillStyle(0x0b1222, 1).fillRect(0, 226, BASE_W, 44);
    g.fillStyle(0x16223a, 1).fillRect(0, 226, BASE_W, 2);
    g.fillStyle(0x1b2741, 1).fillRect(256, 120, 8, 106);
    for (let y = 122; y < 226; y += 8) g.fillStyle(0x2a3a5c, 1).fillRect(256, y, 8, 1).fillRect(244, y + 4, 12, 1);
    g.fillStyle(0xff5d5d, 1).fillRect(259, 118, 2, 2);
    g.fillStyle(0x2a3a5c, 1).fillRect(220, 222, 40, 4);
  }

  private stage(key: string) {
    if (this.stageEmitted.has(key)) return;
    this.stageEmitted.add(key);
    bridge.emit('launchStage', key);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.stage('deploy');
    bridge.emit('launchDone', undefined);
  }

  override update(_time: number, delta: number) {
    if (this.done) return;
    this.t += delta / 1000;
    const t = this.t;
    // Sky: dawn blue -> black space with altitude
    const alt = Math.max(0, t - 4);
    const k = Math.min(1, alt / 7);
    const top = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0x24456e), Phaser.Display.Color.ValueToColor(0x02030a), 100, k * 100);
    const bot = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(0xf2a65a), Phaser.Display.Color.ValueToColor(0x06102a), 100, k * 100);
    this.sky.clear();
    this.sky.fillGradientStyle(Phaser.Display.Color.GetColor(top.r, top.g, top.b), Phaser.Display.Color.GetColor(top.r, top.g, top.b), Phaser.Display.Color.GetColor(bot.r, bot.g, bot.b), Phaser.Display.Color.GetColor(bot.r, bot.g, bot.b), 1);
    this.sky.fillRect(0, 0, BASE_W, BASE_H);
    this.stars.setAlpha(k);

    if (t < 3) this.stage('countdown');
    if (t >= 2.6 && t < 2.7) {
      this.smoke.start();
      rumble(9);
    }
    if (t >= 3) {
      this.stage('liftoff');
      this.flame.setVisible(true).setScale(1, 0.8 + Math.random() * 0.5);
      this.exhaust.start();
    }
    // Ascent: rocket rises, ground scrolls away
    const climb = t < 3 ? 0 : Math.pow(t - 3, 1.7) * 14;
    const ry = Math.max(70, 190 - climb);
    const groundShift = Math.max(0, climb - 120);
    this.rocket.y = ry;
    this.rocket.x = 240 + (t > 5 ? Math.min(40, (t - 5) * 6) : 0);
    this.rocket.rotation = t > 5 ? Math.min(0.5, (t - 5) * 0.08) : 0;
    this.pad.y = groundShift;
    this.smoke.y = 224 + groundShift;
    if (groundShift > 30) this.smoke.stop();
    this.exhaust.setPosition(this.rocket.x - Math.sin(this.rocket.rotation) * 36, this.rocket.y + Math.cos(this.rocket.rotation) * 40);
    if (!this.reduced && t > 3 && t < 8) this.cameras.main.shake(60, 0.002 * (1 - (t - 3) / 5));
    if (t > 6.5) this.stage('maxq');
    if (t > 8.5) {
      this.stage('meco');
      if (this.stage1.visible) {
        play('deploy');
        this.stage1.setVisible(false);
        const s1 = this.add.image(this.rocket.x, this.rocket.y + 10, 'rocket').setCrop(0, 30, 10, 32).setRotation(this.rocket.rotation);
        this.tweens.add({ targets: s1, y: s1.y + 200, rotation: 1.4, alpha: 0, duration: 3000 });
      }
    }
    this.space.clear();
    if (t > 8.5) {
      // Upper stage with fairing halves, then dispenser
      const ux = this.rocket.x;
      const uy = this.rocket.y;
      const fairingOpen = t > 10.5 ? Math.min(1, (t - 10.5) / 1.2) : 0;
      if (t > 10.5) this.stage('fairing');
      this.space.fillStyle(0xdfe6f2, 1).fillRect(ux - 3, uy - 4, 6, 18);
      this.space.fillStyle(0xffd86b, 0.9).fillRect(ux - 2, uy + 14, 4, 3 + Math.random() * 3);
      this.space.fillStyle(0xe6eefc, 1 - fairingOpen);
      this.space.fillRect(ux - 4 - fairingOpen * 30, uy - 24 - fairingOpen * 10, 4, 20);
      this.space.fillRect(ux + fairingOpen * 30, uy - 24 - fairingOpen * 10, 4, 20);
      // Dispenser
      this.space.fillStyle(0x8ea0c2, 1).fillRect(ux - 4, uy - 18, 8, 14);
      if (t > 12) this.stage('orbit');
      if (t > 13.2) {
        const e = Math.min(1, (t - 13.2) / 2.5);
        const cx = ux + e * 30;
        const cy = uy - 18 - e * 60;
        this.space.fillStyle(0xc9d3e6, 1).fillRect(Math.round(cx) - 2, Math.round(cy) - 5, 4, 10);
        const parts = useStore.getState().progress?.design.parts;
        const solar = getComponent(parts?.solar);
        if (e > 0.6) {
          this.stage('deploy');
          this.space.lineStyle(1, 0xffffff, 1).lineBetween(cx, cy - 5, cx - 8, cy - 12).lineBetween(cx, cy - 5, cx + 8, cy - 12);
          if (solar?.deployable) {
            const w = solar.id === 'solar_wing4' ? 18 : 10;
            this.space.fillStyle(0x2a6fd6, 1).fillRect(cx - 2 - w, cy - 3, w, 6).fillRect(cx + 2, cy - 3, w, 6);
          }
        }
        // Earth limb appears
        this.space.fillStyle(0x1a4f8a, Math.min(1, e)).fillEllipse(240, 330, 700, 160);
        this.space.fillStyle(0x6fc3ff, 0.25 * Math.min(1, e)).fillEllipse(240, 322, 712, 170);
      }
    }
    if (t > (this.reduced ? 12 : 17.5)) this.finish();
  }
}
