// Observation science model: simulated cloud cover, pointing coverage, resolution and usability.
// Cloud values are a LABELLED SIMULATED SCENARIO (seeded), not real weather data.
import { effectiveGsdM, coverageFraction } from './design';
import { clamp, keyedRandom, round } from './rng';
import type { Observation, ScienceObjective, SpacecraftComponent, TargetPass, ZoneId } from './types';

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Simulated cloud fraction for a target pass.
 * EDUCATIONAL_SIMPLIFICATION: over tropical Borneo, convective cloud tends to build from late morning and
 * peak in the afternoon, so morning passes are usually clearer. A seeded day-to-day "weather" term and a
 * small local term are added.
 */
export function cloudFraction(pass: TargetPass, seed: number): number {
  const base = cloudBase(pass.localSolarHour);
  const day = Math.floor(pass.tca / 86400);
  const synoptic = (keyedRandom(seed, `day:${day}`) - 0.5) * 0.4;
  const local = (keyedRandom(seed, `loc:${pass.zoneId}:${day}`) - 0.5) * 0.2;
  return round(clamp(base + synoptic + local, 0.02, 0.98), 3);
}

/** Forecast seen by the player before deciding; it has a deterministic error of up to +/-0.12. */
export function forecastCloud(pass: TargetPass, seed: number): number {
  const err = (keyedRandom(seed, `fc:${pass.id}`) - 0.5) * 0.24;
  return round(clamp(cloudFraction(pass, seed) + err, 0, 1), 3);
}

/** Expected cloud for planning (no weather noise), by local solar hour. */
export function climatologicalCloud(localSolarHour: number): number {
  return round(cloudBase(localSolarHour), 3);
}

/** Diurnal cloud baseline: ~12% in the early morning rising to ~45% by late afternoon. */
export function cloudBase(localSolarHour: number): number {
  return 0.12 + 0.33 * smoothstep(9, 16, localSolarHour);
}

/** Lossy compression keeps ~35% of the bytes. Quality cost is larger for NIR science (radiometric precision). */
export const COMPRESSION_RATIO = 0.35;
export const COMPRESSION_QUALITY: Record<'RGB' | 'RGB+NIR', number> = { RGB: 0.9, 'RGB+NIR': 0.75 };
export const MIN_COVERAGE = 0.7;
export const PRIORITY_ZONE_BONUS = 1.3;

export interface CaptureGeometry {
  readonly coverage: number;
  readonly gsdM: number;
}

export function captureGeometry(cam: SpacecraftComponent, adcs: SpacecraftComponent, offNadirDeg: number, altitudeKm: number, pointingPenalty: number): CaptureGeometry {
  const coverage = coverageFraction(cam, (adcs.pointingErrorDeg ?? 90) * pointingPenalty);
  return { coverage: round(coverage, 3), gsdM: round(effectiveGsdM(cam, altitudeKm, offNadirDeg), 1) };
}

/**
 * Off-nadir angle needed to see the target at time t during a pass (linear approximation between the
 * closest approach and the edge of the recorded access window, where the angle reaches the record limit).
 */
export function offNadirAt(pass: TargetPass, t: number, recordLimitDeg: number): number {
  const half = t < pass.tca ? pass.tca - pass.start : pass.end - pass.tca;
  if (half <= 0) return pass.minOffNadirDeg;
  const f = Math.min(1, Math.abs(t - pass.tca) / half);
  return pass.minOffNadirDeg + (recordLimitDeg - pass.minOffNadirDeg) * f;
}

export type UnusableReason = 'cloud' | 'pointing' | 'resolution' | 'bands' | null;

/** Why an observation cannot answer the science question (null = scientifically usable). */
export function unusableReason(obs: Pick<Observation, 'cloud' | 'coverage' | 'gsdM'>, objective: ScienceObjective, cam: SpacecraftComponent): UnusableReason {
  if (objective.needsNir && cam.bands !== 'RGB+NIR') return 'bands';
  if (obs.cloud > objective.maxCloud) return 'cloud';
  if (obs.coverage < MIN_COVERAGE) return 'pointing';
  if (obs.gsdM > objective.maxGsdM) return 'resolution';
  return null;
}

export function observationQuality(cloud: number, coverage: number, gsdM: number, objective: ScienceObjective, compressed: boolean, bands: 'RGB' | 'RGB+NIR'): number {
  const gsdFactor = Math.min(1, objective.maxGsdM / Math.max(1, gsdM));
  const comp = compressed ? COMPRESSION_QUALITY[bands] : 1;
  return round(clamp(coverage * (1 - cloud) * gsdFactor * comp, 0, 1), 3);
}

export function scienceValue(quality: number, usable: boolean, zone: ZoneId, priority: ZoneId): number {
  if (!usable) return 0;
  return round(quality * (zone === priority ? PRIORITY_ZONE_BONUS : 1), 3);
}
