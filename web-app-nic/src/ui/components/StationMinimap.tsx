// Station minimap, drawn like the Godot game's: lawn, paths, walls, room floors and furniture as clean blocks,
// crew as coloured dots, and the objective as a pulsing gold square (or a gold arrow on the rim when out of view).
import { useEffect, useRef } from 'react';
import layout from '../../data/station/layout.json';
import { bridge } from '../../game/bridge';
import { MAP_H, MAP_W, stationMap } from '../../game/stationMap';
import { useStore } from '../../state/store';

const LAWN = '#5f9450';
const PATH = '#c9b48a';
const WALL = '#241e2c';
const INK = '#1c1622';
const STAR = '#f2c94c';
const CREW_COLOR: Record<string, string> = { orion: '#7cc5d9', juno: '#9fd6a5', kai: '#e8c07d' };

function lighten(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Pre-renders the whole station once at the given scale. */
function renderStation(scale: number): HTMLCanvasElement {
  const map = stationMap();
  const c = document.createElement('canvas');
  c.width = Math.ceil(MAP_W * scale);
  c.height = Math.ceil(MAP_H * scale);
  const g = c.getContext('2d')!;
  const fill = (r: { x: number; y: number; w: number; h: number }, col: string) => {
    g.fillStyle = col;
    const x0 = Math.floor(r.x * scale);
    const y0 = Math.floor(r.y * scale);
    g.fillRect(x0, y0, Math.max(1, Math.ceil((r.x + r.w) * scale) - x0), Math.max(1, Math.ceil((r.y + r.h) * scale) - y0));
  };
  g.fillStyle = '#4a7a3f';
  g.fillRect(0, 0, c.width, c.height);
  fill(map.fence, LAWN);
  const grounds = layout.grounds as { paths: number[][]; apron: number[]; parking: number[] };
  for (const p of grounds.paths) fill({ x: p[0]!, y: p[1]!, w: p[2]!, h: p[3]! }, PATH);
  const [ax, ay, ax2, ay2] = grounds.apron as number[];
  fill({ x: ax!, y: ay!, w: ax2! - ax!, h: ay2! - ay! }, '#c7c2b4');
  const [px, py, px2, py2] = grounds.parking as number[];
  fill({ x: px!, y: py!, w: px2! - px!, h: py2! - py! }, '#77797d');
  for (const r of map.rooms) fill(r.outer, WALL);
  for (const r of map.rooms) fill(r.floorRect, lighten(r.floor, 0.25));
  for (const d of map.doors) fill(d, '#e8c07d');
  for (const s of map.solids) fill(s, '#3d3a46');
  return c;
}

let cache = new Map<number, HTMLCanvasElement>();
function station(scale: number) {
  let c = cache.get(scale);
  if (!c) {
    c = renderStation(scale);
    cache.set(scale, c);
  }
  return c;
}

/** mode 'corner': zoomed and centred on you. mode 'full': the whole station (M). */
export function StationMinimap({ mode, width, height, onWalk }: { mode: 'corner' | 'full'; width: number; height: number; onWalk?: (x: number, y: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useStore((s) => s.progress?.phase);
  const scale = mode === 'corner' ? 0.24 : Math.min(width / MAP_W, height / MAP_H);
  useEffect(() => {
    const map = stationMap();
    const objective = map.spotForPhase(phase)?.pos ?? null;
    const tex = station(scale);
    let raf = 0;
    const draw = (t: number) => {
      const c = ref.current?.getContext('2d');
      if (c) {
        c.imageSmoothingEnabled = false;
        c.fillStyle = '#101418';
        c.fillRect(0, 0, width, height);
        const pp = bridge.playerPos ?? map.spawn;
        const centre = mode === 'corner' ? pp : { x: MAP_W / 2, y: MAP_H / 2 };
        const toMini = (p: { x: number; y: number }) => ({ x: Math.round((p.x - centre.x) * scale + width / 2), y: Math.round((p.y - centre.y) * scale + height / 2) });
        const o0 = toMini({ x: 0, y: 0 });
        c.drawImage(tex, o0.x, o0.y);
        for (const m of bridge.crew) {
          const p = toMini(m);
          c.fillStyle = INK;
          c.fillRect(p.x - 3, p.y - 3, 6, 6);
          c.fillStyle = CREW_COLOR[m.id] ?? '#fff';
          c.fillRect(p.x - 2, p.y - 2, 4, 4);
        }
        if (objective) {
          const o = toMini(objective);
          const inner = { x: 4, y: 4, w: width - 8, h: height - 8 };
          const inside = o.x >= inner.x && o.y >= inner.y && o.x < inner.x + inner.w && o.y < inner.y + inner.h;
          if (inside) {
            const r = 3 + (Math.floor(t / 250) % 2);
            c.fillStyle = INK;
            c.fillRect(o.x - r - 1, o.y - r - 1, r * 2 + 2, r * 2 + 2);
            c.fillStyle = STAR;
            c.fillRect(o.x - r, o.y - r, r * 2, r * 2);
          } else {
            const cx = width / 2;
            const cy = height / 2;
            const len = Math.hypot(o.x - cx, o.y - cy) || 1;
            const dx = (o.x - cx) / len;
            const dy = (o.y - cy) / len;
            const k = Math.min(dx !== 0 ? inner.w / 2 / Math.abs(dx) : Infinity, dy !== 0 ? inner.h / 2 / Math.abs(dy) : Infinity);
            const ex = cx + dx * k;
            const ey = cy + dy * k;
            const sx = -dy * 5;
            const sy = dx * 5;
            c.fillStyle = STAR;
            c.beginPath();
            c.moveTo(ex + dx * 5, ey + dy * 5);
            c.lineTo(ex - dx * 5 + sx, ey - dy * 5 + sy);
            c.lineTo(ex - dx * 5 - sx, ey - dy * 5 - sy);
            c.closePath();
            c.fill();
          }
        }
        const p = toMini(pp);
        c.fillStyle = INK;
        c.fillRect(p.x - 4, p.y - 4, 8, 8);
        c.fillStyle = '#fff4dc';
        c.fillRect(p.x - 3, p.y - 3, 6, 6);
        const f = bridge.playerFacing;
        c.fillStyle = '#fff4dc';
        c.fillRect(Math.round(p.x + f.x * 7) - 1, Math.round(p.y + f.y * 7) - 1, 2, 2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, mode, width, height, scale]);
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ imageRendering: 'pixelated', display: 'block', cursor: onWalk ? 'pointer' : 'default' }}
      onClick={(e) => {
        if (!onWalk) return;
        const r = e.currentTarget.getBoundingClientRect();
        const map = stationMap();
        const pp = bridge.playerPos ?? map.spawn;
        const centre = mode === 'corner' ? pp : { x: MAP_W / 2, y: MAP_H / 2 };
        const px = ((e.clientX - r.left) / r.width) * width;
        const py = ((e.clientY - r.top) / r.height) * height;
        onWalk((px - width / 2) / scale + centre.x, (py - height / 2) / scale + centre.y);
      }}
    />
  );
}
