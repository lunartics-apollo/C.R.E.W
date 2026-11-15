// Electrical power model (EDUCATIONAL_SIMPLIFICATION).
// Power (W) is a rate; energy (Wh) is what the battery stores. Energy = power x time.
import { FIXED_BUS } from './catalog';
import { getComponent } from './catalog';
import type { SpacecraftComponent, SpacecraftDesign, SpacecraftMode, Subsystem } from './types';
import { clamp } from './rng';

export const CHARGE_EFFICIENCY = 0.9;
export const DISCHARGE_EFFICIENCY = 0.95;
/** Below this state of charge the flight software forces safe mode. */
export const SAFE_ENTER_SOC = 0.2;
/** Safe mode is released once the battery recovers above this level. */
export const SAFE_EXIT_SOC = 0.4;
/** Below this the battery is in deep discharge and health degrades. */
export const CRITICAL_SOC = 0.05;
/** Battery state of charge at deployment (charged before integration; NASA CubeSat 101 §2.13 allows charging at the integration site). */
export const INITIAL_SOC = 0.8;
/** Battery heater that keeps the cells warm while the spacecraft is in Earth's shadow (W). */
export const ECLIPSE_HEATER_W = 0.8;
/** ADCS power fraction in coarse (safe / load-shed) attitude mode. */
export const COARSE_ADCS_FRACTION = 0.3;

export function part(design: SpacecraftDesign, sub: Subsystem): SpacecraftComponent | undefined {
  return getComponent(design.parts[sub]);
}

/**
 * Advance battery energy by one timestep.
 * Charging applies charge efficiency; discharging draws extra energy to cover discharge losses.
 * Result is always clamped to [0, capacity] — never negative, never above capacity.
 */
export function stepBattery(energyWh: number, capacityWh: number, generationW: number, loadW: number, dtS: number): number {
  const netW = generationW - loadW;
  const dtH = dtS / 3600;
  const next = netW >= 0 ? energyWh + netW * dtH * CHARGE_EFFICIENCY : energyWh + (netW * dtH) / DISCHARGE_EFFICIENCY;
  return clamp(next, 0, capacityWh);
}

export function batteryCapacityWh(design: SpacecraftDesign): number {
  return part(design, 'battery')?.energyWh ?? 0;
}

export function sunlitGenerationW(design: SpacecraftDesign): number {
  return part(design, 'solar')?.sunlitGenerationW ?? 0;
}

/** Continuous spacecraft load (W) for a given mode. */
export function modeLoadW(design: SpacecraftDesign, mode: SpacecraftMode): number {
  const p = (s: Subsystem) => part(design, s);
  const obc = p('obc')?.idlePowerW ?? 0;
  const storage = p('storage')?.idlePowerW ?? 0;
  const adcs = p('adcs')?.idlePowerW ?? 0;
  const payload = p('payload')?.idlePowerW ?? 0;
  const radio = p('radio')?.idlePowerW ?? 0;
  const bus = FIXED_BUS.idlePowerW;
  if (mode === 'nominal') return bus + obc + storage + adcs + payload + radio;
  // safe and load-shed: payload standby off, data radio off, ADCS in coarse mode.
  return bus + obc + storage + adcs * COARSE_ADCS_FRACTION;
}

/** Extra energy (Wh) to slew to a target and take one image. */
export function captureEnergyWh(design: SpacecraftDesign): number {
  const adcs = part(design, 'adcs');
  const cam = part(design, 'payload');
  const obc = part(design, 'obc');
  if (!cam) return 0;
  const slew = adcs ? ((adcs.activePowerW - adcs.idlePowerW) * (adcs.slewSeconds ?? 0)) / 3600 : 0;
  const shoot = ((cam.activePowerW - cam.idlePowerW) * (cam.captureSeconds ?? 0)) / 3600;
  const proc = obc ? ((obc.activePowerW - obc.idlePowerW) * (cam.captureSeconds ?? 0)) / 3600 : 0;
  return Math.max(0, slew + shoot + proc);
}

/** Extra power (W) drawn while transmitting data (radio TX + ADCS ground tracking for directional antennas). */
export function downlinkExtraPowerW(design: SpacecraftDesign): number {
  const radio = part(design, 'radio');
  const adcs = part(design, 'adcs');
  if (!radio) return 0;
  const tx = radio.activePowerW - radio.idlePowerW;
  const tracking = radio.band === 'UHF' || !adcs ? 0 : adcs.activePowerW - adcs.idlePowerW;
  return Math.max(0, tx + tracking);
}

export interface ReferenceOrbitResult {
  readonly eclipseEndSocPct: number;
  readonly imagingOrbitMinSocPct: number;
  readonly orbitAverageMarginW: number;
}

/**
 * Reference power analysis used in the builder and the battery test:
 * 1) run 30 "standby" orbits (sun then eclipse) until the battery reaches steady state;
 * 2) then run one demanding orbit with an image capture and an 8-minute downlink during eclipse.
 */
export function referenceOrbit(design: SpacecraftDesign, sunlitFraction = 0.62, periodMin = 95): ReferenceOrbitResult {
  const cap = batteryCapacityWh(design);
  const gen = sunlitGenerationW(design);
  const load = modeLoadW(design, 'nominal');
  const sunMin = periodMin * sunlitFraction;
  const dt = 60;
  if (cap <= 0) return { eclipseEndSocPct: 0, imagingOrbitMinSocPct: 0, orbitAverageMarginW: gen * sunlitFraction - load };
  let e = cap * INITIAL_SOC;
  let eclipseEnd = e;
  for (let orbit = 0; orbit < 30; orbit++) {
    for (let m = 0; m < periodMin; m++) e = stepBattery(e, cap, m < sunMin ? gen : 0, load + (m < sunMin ? 0 : ECLIPSE_HEATER_W), dt);
    eclipseEnd = e;
  }
  let minE = e;
  const capWh = captureEnergyWh(design);
  const dlW = downlinkExtraPowerW(design);
  for (let m = 0; m < periodMin; m++) {
    const sun = m < sunMin;
    let extra = 0;
    if (m === 2) extra += capWh * 60; // spread capture energy into one minute (W = Wh * 60 / min)
    if (m >= periodMin - 9 && m < periodMin - 1) extra += dlW; // 8-minute downlink in eclipse (worst case)
    e = stepBattery(e, cap, sun ? gen : 0, load + extra + (sun ? 0 : ECLIPSE_HEATER_W), dt);
    minE = Math.min(minE, e);
  }
  const avgMargin = gen * sunlitFraction * CHARGE_EFFICIENCY - load * (sunlitFraction + (1 - sunlitFraction) / DISCHARGE_EFFICIENCY) - (ECLIPSE_HEATER_W * (1 - sunlitFraction)) / DISCHARGE_EFFICIENCY;
  return {
    eclipseEndSocPct: (eclipseEnd / cap) * 100,
    imagingOrbitMinSocPct: (minE / cap) * 100,
    orbitAverageMarginW: avgMargin,
  };
}
