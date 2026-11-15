// Assembly hangar & readiness lab: interactive 3U CubeSat cut-away with install animations,
// live energy flow, exploded view and short test-rig animations (T1–T7).
import Phaser from 'phaser';
import { BASE_H, BASE_W, bridge } from '../bridge';
import { CHASSIS, SUB_COLORS, bayAt, cubesatLayout, type CubeSatLayout, type ModuleRect } from '../cubesatLayout';
import { cgOffsetCm } from '../../simulation/design';
import { makeTextures } from '../textures';
import { getComponent } from '../../simulation/catalog';
import { referenceOrbit } from '../../simulation/power';
import type { PartSelection, Severity, Subsystem, TestId } from '../../simulation/types';
import { useStore } from '../../state/store';

const shade = (c: number, f: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

interface LabAnim {
  id: TestId;
  status: Severity;
  t0: number;
}

export class HangarScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private bg!: Phaser.GameObjects.Graphics;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private layout!: CubeSatLayout;
  private parts!: PartSelection;
  private exploded = false;
  private lab = false;
  private install: { sub: Subsystem; t0: number } | null = null;
  private labAnim: LabAnim | null = null;
  private t = 0;
  private genW = 0;
  private marginW = 0;
  private reduced = false;
  private unsubs: (() => void)[] = [];

  constructor() {
    super('hangar');
  }

  create() {
    makeTextures(this);
    this.reduced = useStore.getState().settings.reducedMotion;
    this.add.tileSprite(0, 0, BASE_W, BASE_H, 'wall').setOrigin(0).setAlpha(0.9);
    this.bg = this.add.graphics();
    this.g = this.add.graphics();
    this.fx = this.add.graphics();
    this.sparks = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 110 },
      lifespan: 450,
      gravityY: 160,
      tint: [0xffd86b, 0x5ad1e6, 0xffffff],
      alpha: { start: 1, end: 0 },
      emitting: false,
    });
    this.sync();
    this.unsubs.push(
      useStore.subscribe((s, prev) => {
        if (s.progress?.design !== prev.progress?.design || s.hangarExploded !== prev.hangarExploded || s.progress?.phase !== prev.progress?.phase) this.sync();
      }),
    );
    this.unsubs.push(bridge.on('labTest', (e) => this.startLab(e.id, e.status)));
    this.events.once('shutdown', () => this.unsubs.forEach((u) => u()));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const bay = bayAt(this.layout, p.x, p.y);
      if (bay) bridge.emit('slotClick', bay);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.input.setDefaultCursor(bayAt(this.layout, p.x, p.y) ? 'pointer' : 'default');
    });
  }

  private sync() {
    const s = useStore.getState();
    const p = s.progress;
    if (!p) return;
    const prevParts = this.parts;
    this.parts = p.design.parts;
    this.exploded = s.hangarExploded && p.phase === 'hangar';
    this.lab = p.phase === 'testlab' || p.phase === 'mrr';
    this.layout = cubesatLayout(this.parts, this.exploded);
    const ref = referenceOrbit(p.design);
    this.genW = getComponent(this.parts.solar)?.sunlitGenerationW ?? 0;
    this.marginW = ref.orbitAverageMarginW;
    if (prevParts) {
      for (const k of Object.keys(this.parts) as Subsystem[]) {
        if (this.parts[k] && this.parts[k] !== prevParts[k]) {
          this.install = { sub: k, t0: this.t };
          if (!this.reduced) this.cameras.main.shake(120, 0.004);
        }
      }
    }
    this.drawBackground();
  }

  private drawBackground() {
    const b = this.bg;
    b.clear();
    // Floor and work stand
    b.fillStyle(0x070c18, 1).fillRect(0, 238, BASE_W, 32);
    b.fillStyle(0x16223a, 1).fillRect(0, 238, BASE_W, 1);
    for (let x = 0; x < BASE_W; x += 24) b.fillStyle(0x0e1729, 1).fillRect(x, 239, 1, 31);
    b.fillStyle(0x1b2741, 1).fillRect(200, 240, 80, 6);
    b.fillStyle(0x2a3a5c, 1).fillRect(204, 238, 72, 2);
    // Overhead light bars
    for (const x of [60, 240, 420]) {
      b.fillStyle(0xdff6ff, 0.9).fillRect(x - 18, 6, 36, 2);
      b.fillStyle(0x5ad1e6, 0.05).fillTriangle(x - 18, 8, x + 18, 8, x + 60, 238);
      b.fillStyle(0x5ad1e6, 0.05).fillTriangle(x - 18, 8, x - 60, 238, x + 60, 238);
    }
    // Side cabinets with LED strips
    for (const x of [14, 432]) {
      b.fillStyle(0x0d1628, 1).fillRect(x, 120, 34, 118);
      b.fillStyle(0x1b2741, 1).fillRect(x, 120, 34, 2);
      for (let i = 0; i < 6; i++) b.fillStyle(0x111c31, 1).fillRect(x + 3, 126 + i * 18, 28, 14);
    }
    if (this.lab) {
      b.fillStyle(0x0a1a12, 0.35).fillRect(0, 0, BASE_W, 238);
      b.lineStyle(1, 0x7ee081, 0.15);
      for (let y = 20; y < 238; y += 20) b.lineBetween(0, y, BASE_W, y);
    }
  }

  private drawModule(m: ModuleRect, dx: number, alpha: number) {
    const g = this.g;
    const x = m.x + dx;
    if (m.empty) {
      g.lineStyle(1, 0x5f7090, 0.7 * alpha);
      for (let i = 0; i < m.w; i += 4) g.lineBetween(x + i, m.y, x + Math.min(m.w, i + 2), m.y);
      for (let i = 0; i < m.w; i += 4) g.lineBetween(x + i, m.y + m.h, x + Math.min(m.w, i + 2), m.y + m.h);
      return;
    }
    const col = SUB_COLORS[m.sub];
    g.fillStyle(shade(col, 0.32), alpha).fillRect(x, m.y, m.w, m.h);
    g.fillStyle(shade(col, 0.6), alpha).fillRect(x, m.y, m.w, 1);
    g.fillStyle(shade(col, 0.18), alpha).fillRect(x, m.y + m.h - 1, m.w, 1);
    // Detail per subsystem
    const cx = x + m.w / 2;
    const cy = m.y + m.h / 2;
    switch (m.sub) {
      case 'payload': {
        const r = Math.min(10, m.h / 2 - 2);
        g.fillStyle(0x0a1020, alpha).fillCircle(cx, cy, r);
        g.lineStyle(1, col, alpha).strokeCircle(cx, cy, r);
        g.fillStyle(col, 0.6 * alpha).fillCircle(cx - r / 3, cy - r / 3, Math.max(1, r / 3));
        g.fillStyle(0x0a1020, alpha).fillRect(cx - 6, m.y + m.h, 12, 3); // lens barrel through -Z plate
        break;
      }
      case 'adcs':
        for (const ox of [-12, 0, 12]) {
          g.lineStyle(1, col, alpha).strokeCircle(cx + ox, cy, Math.min(4, m.h / 2 - 1));
          g.fillStyle(col, alpha).fillRect(cx + ox, cy, 1, 1);
        }
        break;
      case 'battery':
        for (let i = 0; i < 4; i++) g.fillStyle(shade(col, 0.75), alpha).fillRect(x + 4 + i * 10, m.y + 2, 7, Math.max(1, m.h - 4));
        break;
      case 'bus':
        g.lineStyle(1, 0x3fb6a8, 0.7 * alpha);
        for (let i = 3; i < m.h - 2; i += 4) g.lineBetween(x + 3, m.y + i, x + m.w - 3, m.y + i);
        g.fillStyle(0xf2b33d, alpha).fillRect(x + 4, m.y + 3, 2, 2);
        break;
      case 'obc':
        for (let i = 0; i < 4; i++) g.fillStyle(0x111111, alpha).fillRect(x + 6 + i * 9, m.y + 1, 5, Math.max(1, m.h - 2));
        g.fillStyle(this.t % 1 < 0.5 ? 0x7ee081 : 0x1e4a2a, alpha).fillRect(x + m.w - 4, m.y + 1, 2, 2);
        break;
      case 'storage':
        g.fillStyle(0x111111, alpha).fillRect(x + 8, m.y + 1, m.w - 16, Math.max(1, m.h - 2));
        break;
      case 'radio':
        for (let i = 4; i < m.w - 2; i += 5) g.fillStyle(shade(col, 0.7), alpha).fillRect(x + i, m.y + 1, 2, Math.max(1, m.h - 2));
        break;
      case 'deorbit':
        g.lineStyle(1, col, 0.8 * alpha);
        for (let i = 0; i < m.w; i += 6) g.lineBetween(x + i, m.y + m.h, x + i + 6, m.y);
        break;
      default:
        break;
    }
  }

  private drawSat() {
    const g = this.g;
    const L = this.layout;
    const c = L.chassis;
    const solar = getComponent(L.solar);
    const deployed = this.exploded || (this.labAnim?.id === 'T4' && this.t - this.labAnim.t0 > 1.2);
    // Solar
    const panelCol = 0x1d4fa3;
    if (solar) {
      const wings = solar.id === 'solar_wing4' ? 2 : solar.id === 'solar_wing2' ? 1 : 0;
      if (wings && deployed) {
        for (const side of [-1, 1]) {
          for (let w = 0; w < wings; w++) {
            const wx = side < 0 ? c.x - 6 - (w + 1) * 38 : c.x + c.w + 6 + w * 38;
            g.fillStyle(0x0c1d3d, 1).fillRect(wx, c.y + 20, 36, c.h - 40);
            for (let yy = c.y + 22; yy < c.y + c.h - 22; yy += 6) for (let xx = wx + 2; xx < wx + 34; xx += 6) g.fillStyle(panelCol, 1).fillRect(xx, yy, 5, 5);
            g.fillStyle(0x8ea0c2, 1).fillRect(side < 0 ? wx + 36 : wx - 2, c.y + c.h / 2 - 1, 2, 2);
          }
        }
      } else {
        const thick = wings === 2 ? 5 : wings === 1 ? 3 : 2;
        for (const side of [-1, 1]) {
          const sx = side < 0 ? c.x - thick : c.x + c.w;
          g.fillStyle(0x0c1d3d, 1).fillRect(sx, c.y + 6, thick, c.h - 12);
          for (let yy = c.y + 8; yy < c.y + c.h - 8; yy += 5) g.fillStyle(panelCol, 1).fillRect(sx, yy, thick, 3);
        }
      }
      // Burn-wire restraints
      const bw = getComponent(L.restraint)?.burnWires ?? 0;
      if (wings && !deployed) {
        for (let i = 0; i < bw; i++) {
          g.fillStyle(0xff5d5d, 1).fillRect(c.x - 6, c.y + 40 + i * 6, 2, 2);
          g.fillStyle(0xff5d5d, 1).fillRect(c.x + c.w + 4, c.y + 40 + i * 6, 2, 2);
        }
      }
    }
    // Rails & end plates
    g.fillStyle(0x0b1222, 0.85).fillRect(c.x, c.y, c.w, c.h);
    for (const m of L.modules) {
      const anim = this.install && this.install.sub === m.sub ? this.install : null;
      let dx = 0;
      let a = 1;
      if (anim && !this.reduced) {
        const p = Math.min(1, (this.t - anim.t0) / 0.45);
        const e = Phaser.Math.Easing.Back.Out(p);
        dx = (1 - e) * 90;
        a = Math.min(1, p * 2);
        if (p >= 1 && this.install) {
          this.sparks.explode(18, m.x + m.w / 2, m.y + m.h / 2);
          this.install = null;
        }
      }
      if (m.y < c.y + 7 && !this.exploded) {
        // Over-full: module forced above the end plate (door would not close)
        this.drawModule(m, dx, a);
        g.fillStyle(0xff5d5d, 0.25 + 0.2 * Math.sin(this.t * 8)).fillRect(m.x - 2, m.y, m.w + 4, Math.max(0, c.y + 7 - m.y));
      } else this.drawModule(m, dx, a);
    }
    if (!this.exploded) {
      g.fillStyle(0x8ea0c2, 1).fillRect(c.x - 1, c.y, 3, c.h).fillRect(c.x + c.w - 2, c.y, 3, c.h);
      g.fillStyle(0xc9d3e6, 1).fillRect(c.x - 1, c.y, 1, c.h).fillRect(c.x + c.w - 2, c.y, 1, c.h);
      g.fillStyle(0x5f7090, 1).fillRect(c.x, c.y, c.w, 7).fillRect(c.x, c.y + c.h - 7, c.w, 7);
      g.fillStyle(0x2a3a5c, 1).fillRect(c.x + 3, c.y + 2, c.w - 6, 3).fillRect(c.x + 3, c.y + c.h - 5, c.w - 6, 3);
      // Standoffs
      g.fillStyle(0xc9d3e6, 1).fillRect(c.x - 1, c.y - 3, 3, 3).fillRect(c.x + c.w - 2, c.y - 3, 3, 3);
      g.fillStyle(0xc9d3e6, 1).fillRect(c.x - 1, c.y + c.h, 3, 3).fillRect(c.x + c.w - 2, c.y + c.h, 3, 3);
      // RBF pin indicator
      const p = useStore.getState().progress;
      if (p?.design.ditl.rbfPin) {
        g.fillStyle(0xff5d5d, 1).fillRect(c.x + c.w + 1, c.y + c.h - 16, 4, 2);
      }
    } else {
      g.lineStyle(1, 0x3b5480, 0.5).strokeRect(c.x, c.y, c.w, c.h);
    }
    // UHF antenna (fixed bus): folded tape on top; deployed whiskers after release
    if (deployed) {
      g.lineStyle(1, 0xe6eefc, 1);
      g.lineBetween(c.x + 4, c.y, c.x - 26, c.y - 22);
      g.lineBetween(c.x + c.w - 4, c.y, c.x + c.w + 26, c.y - 22);
    } else {
      g.fillStyle(0xe6eefc, 1).fillRect(c.x + 4, c.y - 1, c.w - 8, 1);
    }
    // Hover highlight of the bay being targeted by a drag
    const hov = bridge.hangarHover;
    if (hov) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 10);
      if (hov === 'solar' || hov === 'restraint') {
        g.lineStyle(1, 0xffd86b, 0.6 + 0.4 * pulse).strokeRect(c.x - 10, c.y, c.w + 20, c.h);
      } else {
        const m = L.modules.find((mm) => mm.sub === hov) ?? null;
        if (m) g.lineStyle(1, 0xffd86b, 0.6 + 0.4 * pulse).strokeRect(m.x - 2, m.y - 1, m.w + 4, m.h + 2);
        else g.lineStyle(1, 0xffd86b, 0.6 + 0.4 * pulse).strokeRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4);
      }
    }
  }

  private drawEnergy() {
    const fx = this.fx;
    const bat = this.layout.modules.find((m) => m.sub === 'battery' && !m.empty);
    const bus = this.layout.modules.find((m) => m.sub === 'bus');
    if (!bat || !bus || this.genW <= 0 || this.reduced) return;
    const c = this.layout.chassis;
    const n = Math.min(12, Math.round(this.genW / 2));
    const speed = 0.4 + this.genW / 30;
    const negative = this.marginW < 0;
    for (let i = 0; i < n; i++) {
      const ph = (this.t * speed + i / n) % 1;
      for (const side of [-1, 1]) {
        const sx = side < 0 ? c.x - 2 : c.x + c.w + 2;
        const tx = bat.x + bat.w / 2;
        const ty = bat.y + bat.h / 2;
        const x = sx + (tx - sx) * ph;
        const y = c.y + 30 + (ty - c.y - 30) * ph;
        fx.fillStyle(0xffd86b, 0.9).fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      const ph2 = (this.t * speed * 0.8 + i / n) % 1;
      const bx = bat.x + 4 + ((i * 7) % (bat.w - 8));
      fx.fillStyle(negative ? 0xff5d5d : 0x7ee081, 0.8).fillRect(bx, Math.round(bat.y - (bat.y - bus.y - bus.h / 2) * ph2), 1, 1);
    }
    if (negative) fx.lineStyle(1, 0xff5d5d, 0.4 + 0.4 * Math.sin(this.t * 6)).strokeRect(bat.x - 1, bat.y - 1, bat.w + 2, bat.h + 2);
  }

  private startLab(id: TestId, status: Severity) {
    this.labAnim = { id, status, t0: this.t };
    this.time.delayedCall(this.reduced ? 300 : 2600, () => {
      bridge.emit('labTestDone', id);
    });
  }

  private drawLab() {
    const a = this.labAnim;
    if (!a) return;
    const fx = this.fx;
    const c = this.layout.chassis;
    const p = Math.min(1, (this.t - a.t0) / 2.4);
    const fail = a.status === 'fail';
    const col = fail ? 0xff5d5d : a.status === 'warning' ? 0xf2b33d : 0x7ee081;
    switch (a.id) {
      case 'T1': {
        // Dispenser box slides over the CubeSat; door closes unless over-full/protruding.
        const boxX = c.x - 8;
        const boxW = c.w + 16;
        const drop = (1 - Math.min(1, p * 1.6)) * -120;
        fx.lineStyle(2, 0xc9d3e6, 0.9).strokeRect(boxX, c.y - 6 + drop, boxW, c.h + 12);
        fx.fillStyle(0x8ea0c2, 0.15).fillRect(boxX, c.y - 6 + drop, boxW, c.h + 12);
        const doorAngle = p < 0.6 ? 0 : fail ? 0.35 + 0.05 * Math.sin(this.t * 30) : Math.min(1, (p - 0.6) / 0.3);
        fx.lineStyle(2, col, 1);
        fx.lineBetween(boxX, c.y - 6, boxX + boxW * doorAngle, c.y - 6 - (1 - doorAngle) * 20);
        break;
      }
      case 'T2': {
        fx.fillStyle(0x2a3a5c, 1).fillRect(c.x - 20, c.y + c.h + 3, c.w + 40, 4);
        const p = useStore.getState().progress;
        const cgPx = p ? cgOffsetCm(p.design) * (CHASSIS.pxPerU / 11.35) : 0;
        fx.fillStyle(col, 1).fillCircle(c.x + c.w / 2, c.y + c.h / 2 + cgPx, 3);
        fx.lineStyle(1, col, 0.6).lineBetween(c.x - 10, c.y + c.h / 2, c.x + c.w + 10, c.y + c.h / 2);
        break;
      }
      case 'T3': {
        const sun = Math.sin(p * Math.PI * 6) > 0;
        fx.fillStyle(sun ? 0xffd86b : 0x0a1020, 0.12).fillRect(0, 0, BASE_W, 238);
        const bat = this.layout.modules.find((m) => m.sub === 'battery');
        if (bat) fx.lineStyle(2, sun ? 0xffd86b : col, 0.9).strokeRect(bat.x - 2, bat.y - 2, bat.w + 4, bat.h + 4);
        break;
      }
      case 'T4': {
        // Separation then timers: antenna and wings deploy (drawSat reads this), then TX waves.
        if (p > 0.7) for (let i = 0; i < 3; i++) fx.lineStyle(1, col, 1 - i * 0.3).strokeCircle(c.x + c.w / 2, c.y - 10, 8 + i * 8 + ((this.t * 30) % 8));
        break;
      }
      case 'T5': {
        // Shaker: offset the whole camera slightly (vibration) then TVAC orange glow.
        if (p < 0.6 && !this.reduced) this.cameras.main.setScroll(Math.sin(this.t * 90) * (1.5 + p * 2), 0);
        else this.cameras.main.setScroll(0, 0);
        if (p >= 0.6) fx.fillStyle(0xff8f5d, 0.12 + 0.06 * Math.sin(this.t * 4)).fillRect(c.x - 40, c.y - 20, c.w + 80, c.h + 40);
        if (fail && p > 0.4) {
          fx.fillStyle(0x1d4fa3, 1).fillRect(c.x - 40, c.y + 30, 34, 50);
          fx.lineStyle(1, 0xff5d5d, 1).strokeRect(c.x - 40, c.y + 30, 34, 50);
        }
        fx.fillStyle(0x2a3a5c, 1).fillRect(c.x - 24, c.y + c.h + 3, c.w + 48, 6);
        break;
      }
      case 'T6': {
        const dishX = 410;
        const dishY = 200;
        fx.lineStyle(2, 0xc9d3e6, 1).lineBetween(dishX - 10, dishY - 8, dishX + 10, dishY + 8);
        fx.fillStyle(0x2a3a5c, 1).fillRect(dishX - 2, dishY, 4, 30);
        const k = (this.t * 1.5) % 1;
        const x = dishX + (c.x + c.w - dishX) * k;
        const y = dishY + (c.y + 30 - dishY) * k;
        fx.fillStyle(col, 1).fillRect(Math.round(x), Math.round(y), 3, 3);
        break;
      }
      case 'T7': {
        const ex = 400;
        const ey = 90;
        fx.fillStyle(0x0f3a6a, 1).fillCircle(ex, ey, 22);
        fx.fillStyle(0x2e7d4f, 1).fillCircle(ex - 6, ey - 4, 8);
        const turns = 3;
        for (let i = 0; i < 120 * p; i++) {
          const f = i / 120;
          const r = 50 - f * (fail ? 10 : 26);
          const ang = f * Math.PI * 2 * turns;
          fx.fillStyle(col, 0.8).fillRect(Math.round(ex + Math.cos(ang) * r), Math.round(ey + Math.sin(ang) * r * 0.5), 1, 1);
        }
        break;
      }
    }
    if (p >= 1) this.cameras.main.setScroll(0, 0);
  }

  override update(_time: number, delta: number) {
    this.t += delta / 1000;
    this.g.clear();
    this.fx.clear();
    this.drawSat();
    this.drawEnergy();
    if (this.lab) this.drawLab();
    if (this.labAnim && this.t - this.labAnim.t0 > 6) {
      this.labAnim = null;
      this.cameras.main.setScroll(0, 0);
    }
  }
}
