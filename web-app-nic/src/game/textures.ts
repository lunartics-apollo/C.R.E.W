// Procedurally generated pixel-art textures (original art, no external assets).
import type Phaser from 'phaser';
import { mulberry32 } from '../simulation/rng';

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const c = tex.getContext();
  c.imageSmoothingEnabled = false;
  draw(c);
  tex.refresh();
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Horizon silhouette strip (tileable horizontally). */
function ridge(scene: Phaser.Scene, key: string, w: number, h: number, color: number, seed: number, rough: number, trees: boolean) {
  canvasTex(scene, key, w, h, (c) => {
    const rnd = mulberry32(seed);
    c.fillStyle = hex(color);
    const pts: number[] = [];
    // Sum of sines with integer frequencies -> seamless wrap.
    const f = [1, 2, 3, 5, 8].map((k) => ({ k, a: rough / k ** 0.8, p: rnd() * Math.PI * 2 }));
    for (let x = 0; x < w; x++) {
      let y = h * 0.45;
      for (const s of f) y += Math.sin((x / w) * Math.PI * 2 * s.k + s.p) * s.a;
      pts.push(Math.round(y));
    }
    for (let x = 0; x < w; x++) c.fillRect(x, pts[x]!, 1, h - pts[x]!);
    if (trees) {
      for (let i = 0; i < w / 6; i++) {
        const x = Math.floor(rnd() * w);
        const base = pts[x]!;
        const tall = 4 + Math.floor(rnd() * (rnd() < 0.15 ? 18 : 7));
        const crown = 2 + Math.floor(rnd() * 4);
        c.fillRect(x, base - tall, 1, tall);
        c.fillRect(x - crown, base - tall - 1, crown * 2 + 1, 2);
        c.fillRect(x - crown + 1, base - tall - 2, crown * 2 - 1, 1);
      }
    }
  });
}

export function makeTextures(scene: Phaser.Scene) {
  ridge(scene, 'ridge-far', 480, 60, 0x0f1f36, 11, 9, false);
  ridge(scene, 'ridge-mid', 480, 60, 0x0b182b, 23, 6, true);
  ridge(scene, 'ridge-near', 480, 50, 0x060d1a, 37, 4, true);

  canvasTex(scene, 'dot', 2, 2, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 2, 2);
  });
  canvasTex(scene, 'px', 1, 1, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 1, 1);
  });
  canvasTex(scene, 'spark', 3, 3, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(1, 0, 1, 3);
    c.fillRect(0, 1, 3, 1);
  });
  canvasTex(scene, 'puff', 8, 8, (c) => {
    const pat = ['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..'];
    pat.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '#') {
        c.fillStyle = (x + y) % 3 === 0 ? '#cfd6e6' : '#ffffff';
        c.fillRect(x, y, 1, 1);
      }
    }));
  });
  canvasTex(scene, 'cloud', 24, 10, (c) => {
    const rnd = mulberry32(5);
    for (let i = 0; i < 40; i++) {
      const x = 3 + rnd() * 18;
      const y = 3 + rnd() * 5;
      const r = 1.5 + rnd() * 3;
      c.fillStyle = rnd() < 0.3 ? '#c5d2e6' : '#eef3fb';
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  });
  // Our CubeSat, small icon (wings out) 15x7
  canvasTex(scene, 'sat-icon', 15, 7, (c) => {
    const rows = ['...............', 'BBBB.BBBBB.BBBB', 'BbBb-WWWWW-BbBb', 'BBBB-WMMMW-BBBB', 'BbBb-WWWWW-BbBb', 'BBBB.BBBBB.BBBB', '.......A.......'];
    const pal: Record<string, string> = { B: '#2a6fd6', b: '#5aa0ff', W: '#c9d3e6', M: '#f2c94c', '-': '#8ea0c2', A: '#f2b33d' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const col = pal[ch];
      if (col) {
        c.fillStyle = col;
        c.fillRect(x, y, 1, 1);
      }
    }));
  });
  // Hornbill silhouette, 2 frames (16x8 each) side by side
  canvasTex(scene, 'hornbill', 32, 8, (c) => {
    const f1 = ['................', '..........#.....', '.....#...###....', '....###.#####...', '###########AAAA.', '..#######.....A.', '....###.........', '................'];
    const f2 = ['................', '................', '..........##....', '...######.###...', '###########AAAA.', '.....#........A.', '....###.........', '...#####........'];
    [f1, f2].forEach((f, fi) => f.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '.') return;
      c.fillStyle = ch === 'A' ? '#f2b33d' : '#03060d';
      c.fillRect(fi * 16 + x, y, 1, 1);
    })));
  });
  // Longboat with lantern 14x5
  canvasTex(scene, 'boat', 14, 6, (c) => {
    c.fillStyle = '#ffd86b';
    c.fillRect(9, 0, 1, 1);
    c.fillStyle = '#3a2a1c';
    c.fillRect(9, 1, 1, 2);
    c.fillStyle = '#14101a';
    c.fillRect(1, 3, 12, 1);
    c.fillRect(0, 2, 2, 1);
    c.fillRect(12, 2, 2, 1);
    c.fillRect(2, 4, 10, 1);
    c.fillRect(5, 1, 2, 2);
  });
  // Rocket 10x62
  canvasTex(scene, 'rocket', 10, 62, (c) => {
    c.fillStyle = '#dfe6f2';
    c.fillRect(2, 8, 6, 52);
    c.fillStyle = '#b8c3d6';
    c.fillRect(6, 8, 2, 52);
    c.fillStyle = '#e6eefc';
    c.fillRect(3, 2, 4, 6);
    c.fillRect(4, 0, 2, 2);
    c.fillStyle = '#1b2741';
    c.fillRect(2, 22, 6, 1);
    c.fillRect(2, 40, 6, 1);
    c.fillStyle = '#ff5d5d';
    c.fillRect(2, 44, 6, 2);
    c.fillStyle = '#3b4a66';
    c.fillRect(0, 54, 2, 7);
    c.fillRect(8, 54, 2, 7);
    c.fillRect(3, 60, 4, 2);
  });
  canvasTex(scene, 'flame', 6, 10, (c) => {
    const rows = ['.YYYY.', 'YWWWWY', 'YWWWWY', '.YWWY.', '.OYYO.', '.OYYO.', '..OO..', '..OO..', '..R...', '...R..'];
    const pal: Record<string, string> = { Y: '#ffd86b', W: '#fffbe6', O: '#f2b33d', R: '#ff5d5d' };
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const col = pal[ch];
      if (col) {
        c.fillStyle = col;
        c.fillRect(x, y, 1, 1);
      }
    }));
  });
  // Hangar wall panels (tileable 64x64)
  canvasTex(scene, 'wall', 64, 64, (c) => {
    c.fillStyle = '#0c1424';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#111c31';
    c.fillRect(1, 1, 30, 30);
    c.fillRect(33, 1, 30, 30);
    c.fillRect(1, 33, 62, 30);
    c.fillStyle = '#18243d';
    c.fillRect(1, 1, 30, 1);
    c.fillRect(33, 1, 30, 1);
    c.fillRect(1, 33, 62, 1);
    c.fillStyle = '#2a3a5c';
    for (const [x, y] of [[3, 3], [29, 3], [35, 3], [61, 3], [3, 29], [29, 29], [35, 29], [61, 29], [3, 35], [61, 35], [3, 61], [61, 61]]) c.fillRect(x!, y!, 1, 1);
  });
}
