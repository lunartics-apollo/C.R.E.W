// Original mission director "Director Ayu (KENYALANG)": procedural 32x32 pixel portrait on a CRT monitor
// with blinking, head bob, talking mouth, expressions and gestures, plus a typed, skippable dialogue box.
import { useEffect, useMemo, useRef, useState } from 'react';
import { SCRIPT, type Expression, type Gesture, type Line } from '../../narrative/script';
import { play } from '../../audio/sfx';
import { useStore, useT } from '../../state/store';

const PAL: Record<string, string> = {
  k: '#070b14',
  h: '#1c1726',
  H: '#3a3150',
  s: '#c98d62',
  S: '#a26c47',
  l: '#e2ab7e',
  e: '#1a1020',
  w: '#f4f4f4',
  b: '#2a1f2e',
  m: '#7a3b2e',
  M: '#3a1414',
  r: '#e48a7a',
  j: '#1f6f78',
  J: '#3fb6a8',
  n: '#123f47',
  g: '#8ea0c2',
  G: '#4a5878',
  a: '#f2b33d',
  p: '#ffd86b',
  q: '#ff5d5d',
};

function portrait(expr: Expression, blink: boolean, mouthOpen: boolean, gesture: Gesture): string[][] {
  const N = 32;
  const grid: string[][] = Array.from({ length: N }, () => Array<string>(N).fill('.'));
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < N && y < N) grid[y]![x] = c;
  };
  const inEll = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  // Jacket / shoulders
  for (let y = 22; y < N; y++) {
    const half = 6 + (y - 22) * 1.4;
    for (let x = 0; x < N; x++) {
      if (Math.abs(x + 0.5 - 16) <= half) set(x, y, Math.abs(x + 0.5 - 16) > half - 2 ? 'n' : 'j');
    }
  }
  for (let y = 22; y < 27; y++) {
    set(16 - (y - 21), y, 'J');
    set(15 + (y - 21), y, 'J');
  }
  // Hornbill patch + rank pips
  set(22, 27, 'p');
  set(23, 27, 'p');
  set(24, 27, 'q');
  set(22, 28, 'p');
  set(23, 28, 'p');
  set(9, 27, 'a');
  set(10, 27, 'a');
  // Neck
  for (let y = 20; y < 23; y++) for (let x = 13; x < 19; x++) set(x, y, 'S');
  // Hair back
  for (let y = 2; y < 21; y++) for (let x = 0; x < N; x++) if (inEll(x + 0.5, y + 0.5, 16, 11.5, 9.5, 10)) set(x, y, 'h');
  // Face
  for (let y = 5; y < 22; y++)
    for (let x = 0; x < N; x++)
      if (inEll(x + 0.5, y + 0.5, 16, 13.2, 6.6, 7.8)) set(x, y, x > 18 ? 'S' : x < 12 ? 'l' : 's');
  // Fringe
  for (let x = 9; x < 23; x++) {
    const depth = 7 + ((x * 7) % 3 === 0 ? 2 : (x * 5) % 4 === 0 ? 1 : 0);
    for (let y = 4; y < depth; y++) set(x, y, y === 4 || x % 5 === 0 ? 'H' : 'h');
  }
  // Headset band + ear cups + mic
  for (let x = 8; x < 24; x++) {
    const y = Math.round(3 + ((x - 16) / 8) ** 2 * 3);
    set(x, y, 'G');
  }
  for (let y = 11; y < 17; y++) {
    set(6, y, 'G');
    set(7, y, 'g');
    set(24, y, 'g');
    set(25, y, 'G');
  }
  for (let i = 0; i < 5; i++) set(8 + i, 17 + Math.floor(i / 2), 'G');
  set(13, 19, 'a');
  // Brows
  const browY = expr === 'surprised' ? 10 : 11;
  for (let i = 0; i < 4; i++) {
    let yl = browY;
    let yr = browY;
    if (expr === 'concerned') {
      yl = browY + (i < 2 ? 1 : 0) - (i === 3 ? 1 : 0);
      yr = browY - (i === 0 ? 1 : 0) + (i > 1 ? 1 : 0);
    }
    if (expr === 'serious') {
      yl = browY + (i === 3 ? 1 : 0);
      yr = browY + (i === 0 ? 1 : 0);
    }
    set(11 + i, yl, 'b');
    set(17 + i, yr, 'b');
  }
  // Eyes
  const eye = (x: number) => {
    if (blink) {
      set(x, 14, 'e');
      set(x + 1, 14, 'e');
    } else if (expr === 'happy') {
      set(x, 14, 'e');
      set(x + 1, 13, 'e');
      set(x + 2, 14, 'e');
    } else {
      set(x, 13, 'e');
      set(x + 1, 13, 'e');
      set(x, 14, 'e');
      set(x + 1, 14, 'e');
      set(x, 13, 'w');
      if (expr === 'surprised') {
        set(x, 12, 'e');
        set(x + 1, 12, 'e');
      }
    }
  };
  eye(expr === 'happy' ? 11 : 12);
  eye(expr === 'happy' ? 17 : 18);
  // Nose
  set(16, 15, 'S');
  set(16, 16, 'S');
  // Cheeks
  if (expr === 'happy') {
    set(11, 16, 'r');
    set(21, 16, 'r');
  }
  // Mouth
  if (mouthOpen) {
    for (let x = 14; x < 18; x++) set(x, 18, 'm');
    for (let x = 14; x < 18; x++) set(x, 19, 'M');
  } else if (expr === 'happy') {
    set(13, 17, 'm');
    for (let x = 14; x < 18; x++) set(x, 18, 'm');
    set(18, 17, 'm');
  } else if (expr === 'concerned') {
    set(13, 19, 'm');
    for (let x = 14; x < 18; x++) set(x, 18, 'm');
    set(18, 19, 'm');
  } else if (expr === 'surprised') {
    set(15, 18, 'M');
    set(16, 18, 'M');
    set(15, 19, 'M');
    set(16, 19, 'M');
  } else for (let x = 14; x < 18; x++) set(x, 18, 'm');
  // Gestures
  if (gesture === 'point') {
    for (let y = 21; y < 27; y++) for (let x = 25; x < 29; x++) set(x, y, y > 24 ? 'j' : 's');
    set(28, 20, 's');
    set(28, 19, 's');
  }
  if (gesture === 'thumbs') {
    for (let y = 22; y < 27; y++) for (let x = 3; x < 8; x++) set(x, y, y > 25 ? 'j' : 's');
    set(5, 21, 's');
    set(5, 20, 's');
  }
  // Outline pass
  const out = grid.map((r) => [...r]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (grid[y]![x] !== '.') continue;
      const nb = [grid[y - 1]?.[x], grid[y + 1]?.[x], grid[y]?.[x - 1], grid[y]?.[x + 1]];
      if (nb.some((c) => c && c !== '.')) out[y]![x] = 'k';
    }
  return out;
}

function Portrait({ expr, talking, gesture, size = 112 }: { expr: Expression; talking: boolean; gesture: Gesture; size?: number }) {
  const [blink, setBlink] = useState(false);
  const [mouth, setMouth] = useState(false);
  const reduced = useStore((s) => s.settings.reducedMotion);
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200 + Math.random() * 1500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!talking) {
      setMouth(false);
      return;
    }
    const id = setInterval(() => setMouth((m) => !m), 120);
    return () => clearInterval(id);
  }, [talking]);
  const grid = useMemo(() => portrait(expr, blink, mouth, gesture), [expr, blink, mouth, gesture]);
  const rects: React.ReactElement[] = [];
  grid.forEach((row, y) =>
    row.forEach((c, x) => {
      const fill = PAL[c];
      if (fill) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    }),
  );
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} shapeRendering="crispEdges" style={{ transform: talking && !reduced ? 'translateY(-1px)' : undefined, transition: 'transform 120ms' }} aria-hidden="true">
      {rects}
    </svg>
  );
}

function SignalBars({ active }: { active: boolean }) {
  const [lv, setLv] = useState([2, 3, 2, 4, 3]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setLv(lv.map(() => 1 + Math.floor(Math.random() * 5))), 110);
    return () => clearInterval(id);
  }, [active, lv]);
  return (
    <div className="flex items-end gap-[2px]" aria-hidden="true">
      {lv.map((h, i) => (
        <span key={i} style={{ width: 3, height: (active ? h : 1) * 3 + 2, background: active ? 'var(--cyan)' : 'var(--dim)' }} />
      ))}
    </div>
  );
}

/** Monitor with portrait + typed dialogue. Plays `scene` lines from the script; Space/click advances. */
export function Commander({ scene, onDone, compact = false, autoHide = false }: { scene: string; onDone?: () => void; compact?: boolean; autoHide?: boolean }) {
  const t = useT();
  const instant = useStore((s) => s.settings.instantText);
  const lines: readonly Line[] = SCRIPT[scene] ?? [];
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [hidden, setHidden] = useState(false);
  const line = lines[Math.min(idx, lines.length - 1)];
  const full = line ? t(line.key) : '';
  const typing = shown < full.length;
  const doneRef = useRef(false);

  useEffect(() => {
    setIdx(0);
    setShown(0);
    setHidden(false);
    doneRef.current = false;
  }, [scene]);

  useEffect(() => {
    if (instant) {
      setShown(full.length);
      return;
    }
    if (!typing) return;
    const id = setTimeout(() => {
      setShown((s) => Math.min(full.length, s + 2));
      if (shown % 6 === 0) play('type');
    }, 22);
    return () => clearTimeout(id);
  }, [shown, typing, full, instant]);

  const advance = () => {
    if (typing) {
      setShown(full.length);
      return;
    }
    if (idx < lines.length - 1) {
      setIdx(idx + 1);
      setShown(0);
      play('beep');
    } else if (!doneRef.current) {
      doneRef.current = true;
      onDone?.();
      if (autoHide) setHidden(true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!line || hidden) return null;
  const last = idx >= lines.length - 1 && !typing;
  return (
    <div className={`panel flex gap-3 p-3 rise-in ${compact ? 'items-center' : ''}`} role="dialog" aria-label="Director Ayu" aria-live="polite">
      <div className="crt crt-glare flicker relative shrink-0 border border-line" style={{ width: compact ? 76 : 120, height: compact ? 76 : 120 }}>
        <div className="scanbar" />
        <div className="absolute inset-0 flex items-end justify-center">
          <Portrait expr={line.expr} talking={typing} gesture={line.gesture ?? 'none'} size={compact ? 76 : 116} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="engraved">DIR. AYU · KENYALANG</span>
          <SignalBars active={typing} />
        </div>
        <p className={`text-[0.95rem] leading-snug ${typing ? 'caret' : ''}`}>{full.slice(0, shown)}</p>
        <div className="mt-auto flex justify-end gap-2 pt-2">
          {!last && (
            <button type="button" className="cbtn cbtn-ghost cbtn-sm" onClick={() => { setIdx(lines.length - 1); setShown(t(lines[lines.length - 1]!.key).length); }}>
              {t('common.skip')}
            </button>
          )}
          <button type="button" className="cbtn cbtn-sm" onClick={advance} autoFocus={!compact}>
            {last ? t('common.continue') : t('common.next')} ▸
          </button>
        </div>
      </div>
    </div>
  );
}
