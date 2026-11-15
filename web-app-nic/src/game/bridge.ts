// Typed bridge between React UI and Phaser scenes. Mission state itself lives in the Zustand store.
import type Phaser from 'phaser';
import type { Subsystem, TestId, Severity } from '../simulation/types';

export const BASE_W = 480;
export const BASE_H = 270;

type Events = {
  slotClick: Subsystem;
  labTest: { id: TestId; status: Severity };
  labTestDone: TestId;
  launchStage: string;
  launchDone: undefined;
  hubNear: string | null;
  hubTry: { id: string; ok: boolean };
};

type Handler<T> = (payload: T) => void;
const listeners = new Map<keyof Events, Set<Handler<never>>>();

export const bridge = {
  game: null as Phaser.Game | null,
  hangarHover: null as Subsystem | null,

  on<K extends keyof Events>(name: K, fn: Handler<Events[K]>): () => void {
    let set = listeners.get(name);
    if (!set) {
      set = new Set();
      listeners.set(name, set);
    }
    const s = set as Set<Handler<Events[K]>>;
    s.add(fn);
    return () => {
      s.delete(fn);
    };
  },
  emit<K extends keyof Events>(name: K, payload: Events[K]): void {
    (listeners.get(name) as Set<Handler<Events[K]>> | undefined)?.forEach((fn) => fn(payload));
  },

  canvasRect(): DOMRect | null {
    return this.game?.canvas?.getBoundingClientRect() ?? null;
  },
  /** Convert a client (screen) point to base 480x270 coordinates. */
  toBase(clientX: number, clientY: number): { x: number; y: number } | null {
    const r = this.canvasRect();
    if (!r || r.width === 0) return null;
    return { x: ((clientX - r.left) / r.width) * BASE_W, y: ((clientY - r.top) / r.height) * BASE_H };
  },
  /** Convert base coordinates to client pixels, for crisp React labels over the canvas. */
  toClient(x: number, y: number): { x: number; y: number } | null {
    const r = this.canvasRect();
    if (!r) return null;
    return { x: r.left + (x / BASE_W) * r.width, y: r.top + (y / BASE_H) * r.height };
  },
};
