// Pure layout of the 3U CubeSat cut-away in base (480x270) coordinates. Shared by Phaser and React overlays.
import { USABLE_VOLUME_U, FIXED_BUS, getComponent } from '../simulation/catalog';
import type { PartSelection, Subsystem } from '../simulation/types';

export const CHASSIS = { cx: 240, bottom: 236, pxPerU: 54, width: 48, endPlate: 7 } as const;
export const CHASSIS_H = CHASSIS.pxPerU * 3 + CHASSIS.endPlate * 2;
export const CHASSIS_TOP = CHASSIS.bottom - CHASSIS_H;

export const STACK_ORDER: readonly (Subsystem | 'bus')[] = ['payload', 'adcs', 'battery', 'bus', 'obc', 'storage', 'radio', 'deorbit'];

export const SUB_COLORS: Record<Subsystem | 'bus', number> = {
  payload: 0x5ad1e6,
  adcs: 0x9b8cff,
  battery: 0x7ee081,
  bus: 0x3b5480,
  obc: 0xf2b33d,
  storage: 0xffd86b,
  radio: 0xff8f5d,
  deorbit: 0xc0c8d8,
  solar: 0x2a6fd6,
  restraint: 0xff5d5d,
};

export interface ModuleRect {
  readonly sub: Subsystem | 'bus';
  readonly id: string | null;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly empty: boolean;
}

export interface CubeSatLayout {
  readonly modules: readonly ModuleRect[];
  readonly overflowPx: number;
  readonly chassis: { x: number; y: number; w: number; h: number };
  readonly solar: string | null;
  readonly restraint: string | null;
}

const EMPTY_H = 6;

export function cubesatLayout(parts: PartSelection, exploded: boolean): CubeSatLayout {
  const usablePx = USABLE_VOLUME_U * CHASSIS.pxPerU;
  const x = CHASSIS.cx - CHASSIS.width / 2 + 3;
  const w = CHASSIS.width - 6;
  let y = CHASSIS.bottom - CHASSIS.endPlate;
  const raw: ModuleRect[] = [];
  let usedPx = 0;
  for (const sub of STACK_ORDER) {
    const id = sub === 'bus' ? 'bus' : parts[sub];
    const vol = sub === 'bus' ? FIXED_BUS.volumeU : (getComponent(id)?.volumeU ?? 0);
    const empty = sub !== 'bus' && !id;
    if (sub === 'deorbit' && empty) continue;
    const h = empty ? EMPTY_H : Math.max(5, Math.round(vol * CHASSIS.pxPerU));
    if (!empty) usedPx += vol * CHASSIS.pxPerU;
    y -= h;
    raw.push({ sub, id: sub === 'bus' ? null : id, x, y, w, h, empty });
  }
  const overflowPx = Math.max(0, Math.round(usedPx - usablePx));
  let modules = raw;
  if (exploded) {
    // Spread modules apart around the chassis centre so each bay can be inspected.
    const gap = 7;
    const total = raw.reduce((a, m) => a + m.h, 0) + gap * (raw.length - 1);
    let yy = 135 + total / 2;
    modules = raw.map((m) => {
      yy -= m.h;
      const out = { ...m, y: Math.round(yy) };
      yy -= gap;
      return out;
    });
  }
  return {
    modules,
    overflowPx,
    chassis: { x: CHASSIS.cx - CHASSIS.width / 2, y: CHASSIS_TOP, w: CHASSIS.width, h: CHASSIS_H },
    solar: parts.solar,
    restraint: parts.restraint,
  };
}

/** Which bay (subsystem) is under a base-coordinate point, if any. Exterior parts map to the chassis sides. */
export function bayAt(layout: CubeSatLayout, px: number, py: number): Subsystem | null {
  for (const m of layout.modules) {
    if (m.sub === 'bus') continue;
    if (px >= m.x - 4 && px <= m.x + m.w + 4 && py >= m.y - 1 && py <= m.y + m.h + 1) return m.sub;
  }
  const c = layout.chassis;
  if (py >= c.y && py <= c.y + c.h) {
    if (px >= c.x - 34 && px < c.x) return 'solar';
    if (px > c.x + c.w && px <= c.x + c.w + 34) return 'solar';
  }
  return null;
}

/** True when the point is anywhere on/around the spacecraft (generic drop target). */
export function onSpacecraft(layout: CubeSatLayout, px: number, py: number): boolean {
  const c = layout.chassis;
  return px >= c.x - 40 && px <= c.x + c.w + 40 && py >= c.y - 30 - layout.overflowPx && py <= c.y + c.h + 10;
}
