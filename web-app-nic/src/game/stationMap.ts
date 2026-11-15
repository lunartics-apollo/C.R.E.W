// The academy campus: where each chapter happens. Shared by the Phaser hub scene and the React hub screen.
import type { Phase } from '../state/saveSchema';

export type SpotId = 'control' | 'workshop' | 'office' | 'ground' | 'lab' | 'pad';

export interface Spot {
  readonly id: SpotId;
  /** Centre of the door on the campus path (base 480x270 coordinates). */
  readonly x: number;
  /** Chapters that start here. */
  readonly phases: readonly Phase[];
}

export const SPOTS: readonly Spot[] = [
  { id: 'control', x: 46, phases: ['intro', 'transmission', 'briefing', 'ops', 'debrief'] },
  { id: 'workshop', x: 130, phases: ['hangar'] },
  { id: 'office', x: 214, phases: ['launchPlan'] },
  { id: 'ground', x: 298, phases: ['ground'] },
  { id: 'lab', x: 372, phases: ['testlab', 'mrr'] },
  { id: 'pad', x: 442, phases: ['launch'] },
];

export const DOOR_Y = 176;
export const WALK_MIN_Y = 182;
export const WALK_MAX_Y = 254;
export const NEAR_RADIUS = 24;

export function spotForPhase(phase: Phase | undefined): Spot | null {
  if (!phase) return null;
  return SPOTS.find((s) => s.phases.includes(phase)) ?? null;
}

export function spotById(id: SpotId): Spot {
  return SPOTS.find((s) => s.id === id)!;
}
