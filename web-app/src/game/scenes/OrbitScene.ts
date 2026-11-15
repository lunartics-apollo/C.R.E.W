// 2D Earth/orbit view: real Natural Earth coastlines, day/night terminator, ground track (past/future),
// ground-station visibility circle, camera reach footprint, live contact link and captured images.
// It also animates the mission clock between decisions (presentation only; the sim is already computed).
import Phaser from 'phaser';
import { BASE_H, BASE_W } from '../bridge';
import { makeTextures } from '../textures';
import regionData from '../../data/geo/region.json';
import worldData from '../../data/geo/world.json';
import { RAJANG_LINE, TOWNS } from '../../data/rajang';
import { MISSION_RAJANG, packageById } from '../../simulation/mission';
import { EARTH_RADIUS_KM, buildScenario, elementsFor, subSatellitePoint, subSolarPoint, type OrbitElements } from '../../simulation/orbit';
import { captureReachDeg } from '../../simulation/ops';
import { cloudBase } from '../../simulation/observations';
import { objectiveById } from '../../simulation/mission';
import { unusableReason } from '../../simulation/observations';
import { getComponent } from '../../simulation/catalog';
import { translate } from '../../i18n';
import { useStore } from '../../state/store';
import type { LaunchPackage } from '../../simulation/types';

interface View {
  lon0: number;
  lon1: number;
  lat0: number;
  lat1: number;
}
const REGION: View = { lon0: 98, lon1: 126, lat0: -5, lat1: 10.75 };
const WORLD: View = { lon0: -180, lon1: 180, lat0: -101.25, lat1: 101.25 };
const DEG = Math.PI / 180;

export class OrbitScene extends Phaser.Scene {
  private base!: Phaser.GameObjects.Graphics;
  private track!: Phaser.GameObjects.Graphics;
  private night!: Phaser.GameObjects.Graphics;
  private dyn!: Phaser.GameObjects.Graphics;
  private sat!: Phaser.GameObjects.Image;
  private labels: Phaser.GameObjects.Text[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private view: View = REGION;
  private el: OrbitElements | null = null;
  private pkgId: LaunchPackage['id'] | null = null;
  private localT = 0;
  private lastPush = 0;
  private lastNightT = -1e9;
  private t = 0;
  private unsub: (() => void) | null = null;

  constructor() {
    super('orbit');
  }

  create() {
    makeTextures(this);
    this.base = this.add.graphics();
    this.night = this.add.graphics();
    this.track = this.add.graphics();
    this.dyn = this.add.graphics();
    this.sat = this.add.image(0, 0, 'sat-icon').setDepth(5);
    this.rebuild();
    this.unsub = useStore.subscribe((s, prev) => {
      if (s.orbitView !== prev.orbitView || s.settings.locale !== prev.settings.locale || s.progress?.pkgId !== prev.progress?.pkgId || s.progress?.phase !== prev.progress?.phase || s.progress?.choices.priorityZone !== prev.progress?.choices.priorityZone) this.rebuild();
    });
    this.events.once('shutdown', () => this.unsub?.());
  }

  private proj(lon: number, lat: number): [number, number] {
    const v = this.view;
    let L = lon;
    if (v === WORLD) L = ((((lon + 180) % 360) + 360) % 360) - 180;
    return [((L - v.lon0) / (v.lon1 - v.lon0)) * BASE_W, ((v.lat1 - lat) / (v.lat1 - v.lat0)) * BASE_H];
  }

  private rebuild() {
    const s = useStore.getState();
    const p = s.progress;
    const phase = p?.phase ?? 'menu';
    this.view = s.orbitView === 'world' && phase !== 'debrief' ? WORLD : REGION;
    this.pkgId = p?.pkgId ?? (phase === 'launchPlan' ? 'polar' : null);
    this.el = this.pkgId ? elementsFor(packageById(this.pkgId)) : null;
    this.lastNightT = -1e9;
    const g = this.base;
    g.clear();
    // Ocean with subtle dither
    g.fillStyle(0x061527, 1).fillRect(0, 0, BASE_W, BASE_H);
    for (let y = 0; y < BASE_H; y += 4) for (let x = (y / 4) % 2 ? 0 : 2; x < BASE_W; x += 4) g.fillStyle(0x081c33, 1).fillRect(x, y, 1, 1);
    // Grid
    const step = this.view === REGION ? 5 : 30;
    g.lineStyle(1, 0x1c3555, 0.5);
    for (let lon = Math.ceil(this.view.lon0 / step) * step; lon <= this.view.lon1; lon += step) {
      const [x] = this.proj(lon, 0);
      g.lineBetween(x, 0, x, BASE_H);
    }
    for (let lat = Math.ceil(this.view.lat0 / step) * step; lat <= this.view.lat1; lat += step) {
      const [, y] = this.proj(0, lat);
      g.lineBetween(0, y, BASE_W, y);
    }
    g.lineStyle(1, 0x2b5a7a, 0.7);
    const [, eqY] = this.proj(0, 0);
    g.lineBetween(0, eqY, BASE_W, eqY);
    // Land
    const drawRing = (ring: readonly (readonly number[])[], fill: number, line: number) => {
      const pts = ring.map(([lon, lat]) => {
        const [x, y] = this.proj(lon!, lat!);
        return new Phaser.Math.Vector2(Math.round(x), Math.round(y));
      });
      if (pts.length < 3) return;
      if (this.view === WORLD) {
        // Skip rings that wrap the dateline badly.
        let maxJump = 0;
        for (let i = 1; i < pts.length; i++) maxJump = Math.max(maxJump, Math.abs(pts[i]!.x - pts[i - 1]!.x));
        if (maxJump > BASE_W / 2) return;
      }
      g.fillStyle(fill, 1).fillPoints(pts, true);
      g.lineStyle(1, line, 1).strokePoints(pts, true);
    };
    if (this.view === REGION) {
      for (const sh of (regionData as { shapes: { c: string; p: number[][] }[] }).shapes) {
        const isSarawak = sh.c === 'MY' && sh.p.some(([lon, lat]) => lon! > 109.5 && lon! < 115.6 && lat! < 5.2 && lat! > 0.8);
        drawRing(sh.p, isSarawak ? 0x1f4a35 : 0x16302a, isSarawak ? 0x7ee081 : 0x2f5a48);
      }
      // Rajang
      const pts = RAJANG_LINE.map(([lon, lat]) => this.proj(lon, lat));
      g.lineStyle(2, 0x5ad1e6, 1);
      for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]);
    } else {
      for (const r of (worldData as { rings: number[][][] }).rings) drawRing(r, 0x16302a, 0x2f5a48);
    }
    // Planning: draw the whole first day of ground track as a faint static layer.
    this.track.clear();
    if (phase === 'launchPlan' && this.el) {
      let prevPt: [number, number] | null = null;
      for (let tt = 0; tt <= 86400; tt += this.view === REGION ? 10 : 40) {
        const sp = subSatellitePoint(this.el, tt);
        const pt = this.proj(sp.lon, sp.lat);
        if (prevPt && Math.abs(pt[0] - prevPt[0]) < BASE_W / 2) this.track.lineStyle(1, 0x5ad1e6, 0.28).lineBetween(prevPt[0], prevPt[1], pt[0], pt[1]);
        prevPt = pt;
      }
    }
    // Labels (localized)
    this.labels.forEach((l) => l.destroy());
    this.labels = [];
    this.clouds.forEach((c) => c.destroy());
    this.clouds = [];
    const locale = s.settings.locale;
    const label = (text: string, lon: number, lat: number, color: string, dx = 3, dy = -4) => {
      const [x, y] = this.proj(lon, lat);
      const t = this.add.text(Math.round(x + dx), Math.round(y + dy), text, { fontFamily: 'Silkscreen', fontSize: '8px', color, resolution: 1 }).setDepth(4);
      t.setShadow(1, 1, '#02050c', 0, false, true);
      this.labels.push(t);
    };
    if (this.view === REGION) {
      for (const z of MISSION_RAJANG.zones) {
        const [x, y] = this.proj(z.lonDeg, z.latDeg);
        const c = this.add.image(x + 6, y - 2, 'cloud').setAlpha(0).setDepth(3);
        this.clouds.push(c);
      }
      const pz = MISSION_RAJANG.zones.find((z) => z.id === (p?.choices.priorityZone ?? 'sibu'))!;
      label(`RAJANG · ${translate(locale, `zone.${pz.id}`)}`, 111.2, 3.4, '#ffd86b', 0, 0);
      for (const town of TOWNS) if (town.name === 'Kuching' || town.name === 'Miri') label(town.name, town.lon, town.lat, '#93a6c8', 3, 2);
      label('BORNEO', 114.5, 0.2, '#3f6b58');
      label('SOUTH CHINA SEA', 108.5, 6.5, '#2b5a7a');
    }
  }

  private drawCircle(g: Phaser.GameObjects.Graphics, lon: number, lat: number, radiusDeg: number, color: number, alpha: number) {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= 48; i++) {
      const th = (i / 48) * Math.PI * 2;
      const la = lat + radiusDeg * Math.cos(th);
      const lo = lon + (radiusDeg * Math.sin(th)) / Math.max(0.2, Math.cos(lat * DEG));
      const [x, y] = this.proj(lo, la);
      pts.push(new Phaser.Math.Vector2(x, y));
    }
    g.lineStyle(1, color, alpha).strokePoints(pts, false);
  }

  private drawNight(jd: number) {
    const ss = subSolarPoint(jd);
    const g = this.night;
    g.clear();
    const cell = 6;
    const sd = Math.sin(ss.lat * DEG);
    const cd = Math.cos(ss.lat * DEG);
    for (let y = 0; y < BASE_H; y += cell) {
      const lat = this.view.lat1 - ((y + cell / 2) / BASE_H) * (this.view.lat1 - this.view.lat0);
      if (Math.abs(lat) > 90) continue;
      const sl = Math.sin(lat * DEG);
      const cl = Math.cos(lat * DEG);
      for (let x = 0; x < BASE_W; x += cell) {
        const lon = this.view.lon0 + ((x + cell / 2) / BASE_W) * (this.view.lon1 - this.view.lon0);
        const cz = sl * sd + cl * cd * Math.cos((lon - ss.lon) * DEG);
        if (cz < 0.08) g.fillStyle(0x01030a, cz < -0.08 ? 0.55 : 0.3).fillRect(x, y, cell, cell);
      }
    }
  }

  override update(_time: number, delta: number) {
    this.t += delta / 1000;
    const s = useStore.getState();
    const p = s.progress;
    const g = this.dyn;
    g.clear();
    if (!p || !this.el || !this.pkgId) {
      this.sat.setVisible(false);
      return;
    }
    const pkg = packageById(this.pkgId);
    let viewT: number;
    if (p.phase === 'launchPlan') {
      this.localT = (this.localT + (delta / 1000) * 900) % 86400;
      viewT = this.localT;
    } else if (p.phase === 'debrief') {
      viewT = p.runtime?.t ?? 0;
    } else {
      viewT = s.viewT;
      const target = p.runtime?.t ?? 0;
      if (s.animating) {
        viewT = Math.min(target, viewT + (delta / 1000) * s.speed);
        if (viewT >= target || s.settings.reducedMotion) {
          s.setViewT(target, false);
          viewT = target;
        } else if (this.t - this.lastPush > 0.066) {
          this.lastPush = this.t;
          s.setViewT(viewT, true);
        }
      }
    }
    const jd = this.el.jd0 + viewT / 86400;
    if (Math.abs(viewT - this.lastNightT) > 240) {
      this.drawNight(jd);
      this.lastNightT = viewT;
    }
    // Clouds over the zones follow the simulated diurnal pattern (decorative weather layer).
    if (this.clouds.length) {
      const utcH = (Date.parse(MISSION_RAJANG.epochIso) / 3600000 + pkg.deployOffsetHours + viewT / 3600) % 24;
      MISSION_RAJANG.zones.forEach((z, i) => {
        const lst = (utcH + z.lonDeg / 15 + 24) % 24;
        const c = this.clouds[i];
        if (!c) return;
        const day = lst > 6 && lst < 18.5;
        c.setAlpha(day ? cloudBase(lst) * 1.3 : 0.15).setX(c.x + Math.sin(this.t * 0.3 + i) * 0.02);
      });
    }
    // Ground station circle(s)
    const altKm = pkg.altitudeKm;
    const e = 10 * DEG;
    const lambda = Math.acos((EARTH_RADIUS_KM * Math.cos(e)) / (EARTH_RADIUS_KM + altKm)) - e;
    const stations: [number, number][] = [[110.4, 1.5]];
    if (p.runtime?.partnerStation) stations.push([114.0, 4.4]);
    for (const [lo, la] of stations) {
      this.drawCircle(g, lo, la, lambda / DEG, 0x5ad1e6, 0.45);
      const [x, y] = this.proj(lo, la);
      g.fillStyle(0x5ad1e6, 1).fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    }
    // Zones
    if (this.view === REGION) {
      for (const z of MISSION_RAJANG.zones) {
        const [x, y] = this.proj(z.lonDeg, z.latDeg);
        const pri = p.choices.priorityZone === z.id;
        g.lineStyle(1, pri ? 0xffd86b : 0xf2b33d, 0.9).strokeRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
        if (pri) g.lineStyle(1, 0xffd86b, 0.3 + 0.3 * Math.sin(this.t * 4)).strokeRect(Math.round(x) - 6, Math.round(y) - 6, 12, 12);
      }
    }
    // Ground track: past (solid) and future (dotted)
    const period = 2 * Math.PI / this.el.uDot;
    const span = this.view === REGION ? period * 0.5 : period * 1.1;
    let prev: [number, number] | null = null;
    for (let tt = viewT - span; tt <= viewT + span; tt += this.view === REGION ? 15 : 40) {
      if (tt < 0) continue;
      const sp = subSatellitePoint(this.el, tt);
      const pt = this.proj(sp.lon, sp.lat);
      if (prev && Math.abs(pt[0] - prev[0]) < BASE_W / 2) {
        if (tt <= viewT) g.lineStyle(1, 0x5ad1e6, 0.9).lineBetween(prev[0], prev[1], pt[0], pt[1]);
        else if (Math.floor(tt / 60) % 2 === 0) g.lineStyle(1, 0x93a6c8, 0.55).lineBetween(prev[0], prev[1], pt[0], pt[1]);
      }
      prev = pt;
    }
    const sp = subSatellitePoint(this.el, viewT);
    const [sx, sy] = this.proj(sp.lon, sp.lat);
    this.sat.setVisible(true).setPosition(Math.round(sx), Math.round(sy));
    // Camera reach footprint
    const reach = captureReachDeg(p.design);
    if (reach > 0) {
      const R = EARTH_RADIUS_KM;
      const gamma = Math.asin(Math.min(1, ((R + altKm) / R) * Math.sin(reach * DEG))) - reach * DEG;
      this.drawCircle(g, sp.lon, sp.lat, gamma / DEG, 0xffd86b, 0.35);
    }
    // Contact link line
    if (p.phase === 'ops' || p.phase === 'debrief') {
      const scn = buildScenario(pkg);
      const inContact = scn.contacts.find((c) => viewT >= c.start && viewT < c.end && (c.stationId !== 'partner_miri' || p.runtime?.partnerStation));
      if (inContact) {
        const [lo, la] = inContact.stationId === 'partner_miri' ? [114.0, 4.4] : [110.4, 1.5];
        const [gx, gy] = this.proj(lo, la);
        const n = 8;
        for (let i = 0; i < n; i++) {
          const f = ((i / n + this.t * 0.8) % 1);
          g.fillStyle(0x7ee081, 1).fillRect(Math.round(gx + (sx - gx) * f), Math.round(gy + (sy - gy) * f), 2, 2);
        }
      }
      // Captures (shown once the clock has passed them)
      const cam = getComponent(p.design.parts.payload);
      const obj = objectiveById(p.choices.objective);
      for (const o of p.runtime?.observations ?? []) {
        if (o.t > viewT) continue;
        const z = MISSION_RAJANG.zones.find((zz) => zz.id === o.zoneId);
        if (!z) continue;
        const [x, y] = this.proj(z.lonDeg, z.latDeg);
        const ok = cam ? unusableReason(o, obj, cam) === null : false;
        const col = o.status === 'deleted' ? 0x5f7090 : ok ? 0x7ee081 : 0xff5d5d;
        const age = viewT - o.t;
        if (age < 600) g.fillStyle(0xffffff, 1 - age / 600).fillCircle(x, y, 4 + age / 60);
        g.lineStyle(1, col, 1).strokeCircle(x, y, 5);
      }
    }
  }
}
