// The C.R.E.W. ground station, ported from the Godot game (scripts/station_map.gd).
// Rooms, doors, furniture collision, interaction spots and A* pathfinding all come from the same layout JSON.
import layout from '../data/station/layout.json';
import furniture from '../data/station/props.json';
import type { Phase } from '../state/saveSchema';

export interface Vec {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Room {
  id: string;
  name: string;
  rect: Rect;
  floorRect: Rect;
  outer: Rect;
  floor: string;
}
export interface Spot {
  id: string;
  name: string;
  room: string;
  pos: Vec;
}

const CELL = 8;
const TREE_TRUNK = { w: 10, h: 8 };
export const MAP_W = layout.size[0]!;
export const MAP_H = layout.size[1]!;
export const SPOT_RADIUS = 44;
export const PLAYER_SPEED = 92;

const rect = (a: readonly number[]): Rect => ({ x: a[0]!, y: a[1]!, w: a[2]!, h: a[3]! });
const inRect = (r: Rect, p: Vec) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h;

/** Where each chapter happens on the station: [spot id, short hint]. */
export const PHASE_SPOT: Partial<Record<Phase, string>> = {
  briefing: 'plot_trajectory',
  hangar: 'assemble_panels',
  launchPlan: 'launch_console',
  ground: 'align_antenna',
  testlab: 'divert_power',
  mrr: 'upload_flight_plan',
  launch: 'fuel_rocket',
  ops: 'download_telemetry',
  debrief: 'plot_trajectory',
};

export class StationMap {
  readonly fence: Rect = rect(layout.fence);
  readonly rooms: Room[] = [];
  readonly doors: Rect[] = [];
  readonly solids: Rect[] = [];
  readonly spots = new Map<string, Spot>();
  readonly rocketPos: Vec = { x: layout.rocket[0]!, y: layout.rocket[1]! };
  readonly spawn: Vec = { x: 900, y: 548 };
  private blocked: Uint8Array;
  private cols = Math.floor(MAP_W / CELL);
  private rows = Math.floor(MAP_H / CELL);

  constructor() {
    for (const [id, r] of Object.entries(layout.rooms)) {
      const rr = rect(r.rect);
      this.rooms.push({ id, name: r.name, rect: rr, floor: r.floor, floorRect: { x: rr.x, y: rr.y + layout.face, w: rr.w, h: rr.h - layout.face }, outer: { x: rr.x - layout.wall, y: rr.y - layout.wall, w: rr.w + layout.wall * 2, h: rr.h + layout.wall * 2 } });
    }
    for (const d of layout.doors) this.doors.push(rect(d.rect));
    for (const o of layout.obstacles) this.solids.push(rect(o.rect));
    for (const f of furniture as { collision?: number[] }[]) if (f.collision) this.solids.push(rect(f.collision));
    for (const p of Object.values(layout.props)) this.solids.push(rect(p.solid));
    for (const t of layout.trees) this.solids.push({ x: t[0]! - TREE_TRUNK.w / 2, y: t[1]! - TREE_TRUNK.h, w: TREE_TRUNK.w, h: TREE_TRUNK.h });
    for (const l of layout.lamps) this.solids.push({ x: l[0]! - 2, y: l[1]! - 3, w: 4, h: 4 });
    for (const d of layout.decor as { pos: number[]; solid?: number[] }[]) if (d.solid) this.solids.push({ x: d.pos[0]! - d.solid[0]! / 2, y: d.pos[1]! - d.solid[1]!, w: d.solid[0]!, h: d.solid[1]! });
    for (const s of layout.spots) this.spots.set(s.id, { id: s.id, name: s.name, room: s.room, pos: { x: s.pos[0]!, y: s.pos[1]! } });
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let cy = 0; cy < this.rows; cy++) for (let cx = 0; cx < this.cols; cx++) if (this.isBlocked({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 })) this.blocked[cy * this.cols + cx] = 1;
  }

  /** Inside the building walls, or outside the fence. */
  isWall(p: Vec): boolean {
    if (!inRect(this.fence, p)) return true;
    for (const d of this.doors) if (inRect(d, p)) return false;
    let inBuilding = false;
    for (const r of this.rooms) {
      if (inRect(r.floorRect, p)) return false;
      if (inRect(r.outer, p)) inBuilding = true;
    }
    return inBuilding;
  }

  isBlocked(p: Vec): boolean {
    if (this.isWall(p)) return true;
    for (const s of this.solids) if (inRect(s, p)) return true;
    return false;
  }

  roomAt(p: Vec): Room | null {
    return this.rooms.find((r) => inRect(r.rect, p)) ?? null;
  }

  /** The nearest interaction spot within reach, if any. */
  spotNear(p: Vec): Spot | null {
    let best: Spot | null = null;
    let bestD = SPOT_RADIUS;
    for (const s of this.spots.values()) {
      const d = Math.hypot(s.pos.x - p.x, s.pos.y - p.y);
      if (d <= bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  spotForPhase(phase: Phase | undefined): Spot | null {
    const id = phase ? PHASE_SPOT[phase] : undefined;
    return id ? (this.spots.get(id) ?? null) : null;
  }

  private cellBlocked(cx: number, cy: number): boolean {
    return cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows || this.blocked[cy * this.cols + cx] === 1;
  }

  private nearestOpen(p: Vec): { cx: number; cy: number } {
    const ox = Math.floor(p.x / CELL);
    const oy = Math.floor(p.y / CELL);
    for (let r = 0; r < 8; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (!this.cellBlocked(ox + dx, oy + dy)) return { cx: ox + dx, cy: oy + dy };
    return { cx: ox, cy: oy };
  }

  /** World-space waypoints from a to b (empty when unreachable). 8-way A* on the 8 px grid. */
  findPath(a: Vec, b: Vec): Vec[] {
    const s = this.nearestOpen(a);
    const g = this.nearestOpen(b);
    const key = (cx: number, cy: number) => cy * this.cols + cx;
    const goalKey = key(g.cx, g.cy);
    const cost = new Map<number, number>([[key(s.cx, s.cy), 0]]);
    const from = new Map<number, number>();
    // Binary heap of [f, key]
    const heap: [number, number][] = [[0, key(s.cx, s.cy)]];
    const push = (item: [number, number]) => {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]![0] <= heap[i]![0]) break;
        [heap[p], heap[i]] = [heap[i]!, heap[p]!];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
          if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i]!, heap[m]!];
          i = m;
        }
      }
      return top;
    };
    const h = (cx: number, cy: number) => Math.hypot(cx - g.cx, cy - g.cy);
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (k === goalKey) {
        found = true;
        break;
      }
      const cx = k % this.cols;
      const cy = Math.floor(k / this.cols);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (this.cellBlocked(nx, ny)) continue;
          if (dx && dy && (this.cellBlocked(cx + dx, cy) || this.cellBlocked(cx, cy + dy))) continue; // no corner cutting
          const nk = key(nx, ny);
          const c = cost.get(k)! + (dx && dy ? 1.414 : 1);
          if (c < (cost.get(nk) ?? Infinity)) {
            cost.set(nk, c);
            from.set(nk, k);
            push([c + h(nx, ny), nk]);
          }
        }
      }
    }
    if (!found) return [];
    const out: Vec[] = [];
    for (let k: number | undefined = goalKey; k !== undefined; k = from.get(k)) out.push({ x: (k % this.cols) * CELL + CELL / 2, y: Math.floor(k / this.cols) * CELL + CELL / 2 });
    out.reverse();
    if (!this.isBlocked(b)) out[out.length - 1] = { x: b.x, y: b.y };
    return out;
  }
}

let shared: StationMap | null = null;
export function stationMap(): StationMap {
  return (shared ??= new StationMap());
}

export const ROOM_ACCENT: Record<string, string> = Object.fromEntries(Object.entries(layout.rooms).map(([id, r]) => [id, (r as { accent?: string }).accent ?? '#f2c94c']));
