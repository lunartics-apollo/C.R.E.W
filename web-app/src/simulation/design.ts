// Spacecraft design evaluation: mass, volume, envelope, budget, power, storage, link and objective fit.
import { CATALOG, FIXED_BUS, USABLE_VOLUME_U, getComponent } from './catalog';
import { MISSION_RAJANG, objectiveById } from './mission';
import { batteryCapacityWh, modeLoadW, part, referenceOrbit, sunlitGenerationW } from './power';
import { clamp, round } from './rng';
import type {
  DesignReport,
  Finding,
  GroundStation,
  LaunchPackage,
  MissionChoices,
  PartSelection,
  Purchases,
  SpacecraftComponent,
  SpacecraftDesign,
  Subsystem,
} from './types';
import { ESSENTIAL_SUBSYSTEMS, SUBSYSTEMS } from './types';

/** Default/limit used before a launch package is chosen (NASA CubeSat 101 App. C sample 3U checklist: mass < 4.00 kg). */
export const DEFAULT_MAX_MASS_KG = 4.0;
/** CDS protrusion allowance quoted in NASA CubeSat 101 §2.4 and App. C: 6.5 mm. */
export const MAX_PROTRUSION_MM = 6.5;
/** Nominal 3U dimensions from NASA CubeSat 101 §1.1 / App. C (mm). */
export const RAIL_LENGTH_MM = 340.5;
export const WIDTH_MM = 100;
/** Centre-of-gravity tolerance along the long axis (modelled on the CubeSat Design Specification; verify vs mission ICD). */
export const CG_LIMIT_CM = 7;
export const PROTOCOL_EFFICIENCY = 0.8;
export const MASS_MARGIN_WARN = 0.05;

export const TEST_COST_CR = { T1: 5, T2: 5, T3: 10, T4: 10, T5: 40, T6: 10, T7: 5 } as const;
export const PURCHASE_COST_CR = { batteryQualification: 25, heritageQualification: 20 } as const;
export const TOTAL_TEST_ESTIMATE_CR = Object.values(TEST_COST_CR).reduce((a, b) => a + b, 0);

export const EMPTY_PARTS: PartSelection = {
  payload: null,
  adcs: null,
  solar: null,
  battery: null,
  obc: null,
  storage: null,
  radio: null,
  restraint: null,
  deorbit: null,
};

export const DEFAULT_DITL = { separationSwitches: 1, rbfPin: false, deployDelayMin: 5, txDelayMin: 5 } as const;

export function emptyDesign(): SpacecraftDesign {
  return { chassis: '3U', parts: { ...EMPTY_PARTS }, ditl: { ...DEFAULT_DITL } };
}

export function installedParts(design: SpacecraftDesign): SpacecraftComponent[] {
  return SUBSYSTEMS.map((s) => getComponent(design.parts[s])).filter((c): c is SpacecraftComponent => !!c);
}

export function withPart(design: SpacecraftDesign, sub: Subsystem, id: string | null): SpacecraftDesign {
  if (id !== null) {
    const c = getComponent(id);
    if (!c || c.subsystem !== sub) throw new Error(`Component ${id} cannot be installed in ${sub}`);
  }
  return { ...design, parts: { ...design.parts, [sub]: id } };
}

export function totalMassKg(design: SpacecraftDesign): number {
  return round(FIXED_BUS.massKg + installedParts(design).reduce((a, c) => a + c.massKg, 0), 3);
}

export function usedVolumeU(design: SpacecraftDesign): number {
  return round(FIXED_BUS.volumeU + installedParts(design).reduce((a, c) => a + c.volumeU, 0), 3);
}

export function maxProtrusionMm(design: SpacecraftDesign): number {
  const parts = installedParts(design);
  const overfill = Math.max(0, usedVolumeU(design) - USABLE_VOLUME_U);
  // Over-filling the frame forces modules past the end plates: ~113.5 mm of rail length per U (App. C 3U = 340.5 mm).
  const bulge = overfill * (RAIL_LENGTH_MM / 3);
  return round(Math.max(0, ...parts.map((c) => c.protrusionMm)) + bulge, 1);
}

export function hasDeployables(design: SpacecraftDesign): boolean {
  return FIXED_BUS.deployableAntenna || installedParts(design).some((c) => c.deployable);
}

export function hardwareCostCr(design: SpacecraftDesign): number {
  return FIXED_BUS.costCr + installedParts(design).reduce((a, c) => a + c.costCr, 0);
}

export function opsCostCr(): number {
  return MISSION_RAJANG.opsCrPerDay * MISSION_RAJANG.campaignDays;
}

export interface BudgetBreakdown {
  readonly hardware: number;
  readonly launch: number;
  readonly groundSegment: number;
  readonly testing: number;
  readonly travel: number;
  readonly operations: number;
  readonly purchases: number;
  readonly committed: number;
  readonly ceiling: number;
  readonly reserve: number;
  readonly reserveFraction: number;
}

/**
 * spent = hardware + ground segment + testing + launch package + travel + operations (+ extra qualification).
 * Testing uses the real spend so far, or the full test estimate if no tests have run yet.
 */
export function budget(
  design: SpacecraftDesign,
  choices: Pick<MissionChoices, 'mode'>,
  pkg: LaunchPackage | null,
  station: GroundStation | null,
  testsSpentCr: number | null,
  purchases: Purchases,
  opsReserveSpentCr = 0,
): BudgetBreakdown {
  const hardware = hardwareCostCr(design);
  const launch = pkg?.costCr ?? 0;
  const groundSegment = station?.costCr ?? 0;
  const testing = testsSpentCr ?? TOTAL_TEST_ESTIMATE_CR;
  const travel = MISSION_RAJANG.travelCr;
  const operations = opsCostCr() + opsReserveSpentCr;
  const purchasesCr =
    (purchases.batteryQualification ? PURCHASE_COST_CR.batteryQualification : 0) +
    (purchases.heritageQualification ? PURCHASE_COST_CR.heritageQualification : 0);
  const committed = hardware + launch + groundSegment + testing + travel + operations + purchasesCr;
  const ceiling = MISSION_RAJANG.budgetCr[choices.mode];
  const reserve = ceiling - committed;
  return {
    hardware,
    launch,
    groundSegment,
    testing,
    travel,
    operations,
    purchases: purchasesCr,
    committed,
    ceiling,
    reserve,
    reserveFraction: reserve / ceiling,
  };
}

/** Effective ground sample distance (m): scales with altitude and degrades off-nadir (~1/cos^2). */
export function effectiveGsdM(cam: SpacecraftComponent, altitudeKm: number, offNadirDeg: number): number {
  const c = Math.cos((offNadirDeg * Math.PI) / 180);
  return ((cam.gsdAt500kmM ?? 999) * (altitudeKm / 500)) / (c * c);
}

/** Fraction of the target inside the image, given pointing error vs. the camera half field-of-view. */
export function coverageFraction(cam: SpacecraftComponent | undefined, pointingErrorDeg: number): number {
  if (!cam?.fovHalfDeg) return 0;
  if (pointingErrorDeg <= cam.fovHalfDeg) return 1;
  return clamp(cam.fovHalfDeg / pointingErrorDeg, 0, 1);
}

/** Spacecraft-side pointing factor for the downlink antenna. */
export function satPointingFactor(design: SpacecraftDesign): number {
  const radio = part(design, 'radio');
  const adcs = part(design, 'adcs');
  if (!radio || !adcs) return 0;
  const req = radio.requiredPointingDeg ?? 90;
  const err = adcs.pointingErrorDeg ?? 90;
  return err <= req ? 1 : Math.max(0.05, (req / err) ** 2);
}

/** Ground-antenna pointing loss from calibration error: L(dB) = 12 (err / beamwidth)^2 (standard parabolic approximation). */
export function groundPointingFactor(station: GroundStation | null, calibrationErrorDeg: number): number {
  if (!station) return 0;
  const lossDb = 12 * (calibrationErrorDeg / station.beamwidthDeg) ** 2;
  return 10 ** (-lossDb / 10);
}

export function stationSupportsRadio(station: GroundStation | null, design: SpacecraftDesign): boolean {
  const band = part(design, 'radio')?.band;
  return !!station && !!band && station.bands.includes(band);
}

/** Effective link efficiency in [0,1] combining protocol overhead, both pointing factors and optional rain fade. */
export function linkEfficiency(design: SpacecraftDesign, station: GroundStation | null, calibrationErrorDeg: number, rainFade = 1): number {
  if (!stationSupportsRadio(station, design)) return 0;
  return PROTOCOL_EFFICIENCY * satPointingFactor(design) * groundPointingFactor(station, calibrationErrorDeg) * rainFade;
}

/** transferredMB = rate(Mbps) x seconds / 8 x efficiency */
export function transferCapacityMB(rateMbps: number, seconds: number, efficiency: number): number {
  return (rateMbps * Math.max(0, seconds)) / 8 * efficiency;
}

export const REFERENCE_PASS_S = 300;

export function mbPerReferencePass(design: SpacecraftDesign, station: GroundStation | null, calibrationErrorDeg = 0): number {
  const rate = part(design, 'radio')?.dataRateMbps ?? 0;
  return transferCapacityMB(rate, REFERENCE_PASS_S, linkEfficiency(design, station, calibrationErrorDeg));
}

/** Centre of gravity offset along the long (Z) axis from a simple 1-D stacking model (cm). */
export function cgOffsetCm(design: SpacecraftDesign): number {
  const order: Subsystem[] = ['payload', 'adcs', 'battery', 'obc', 'storage', 'radio', 'deorbit'];
  const mmPerU = RAIL_LENGTH_MM / 3;
  let z = 10; // start above the -Z end plate
  let moment = 0;
  let mass = 0;
  for (const s of order) {
    const c = part(design, s);
    if (!c) continue;
    const len = Math.max(8, c.volumeU * mmPerU);
    const centre = z + len / 2;
    moment += c.massKg * centre;
    mass += c.massKg;
    z += len;
  }
  // Fixed bus, solar panels and restraint are distributed symmetrically around the centre.
  const sym = FIXED_BUS.massKg + (part(design, 'solar')?.massKg ?? 0) + (part(design, 'restraint')?.massKg ?? 0);
  moment += sym * (RAIL_LENGTH_MM / 2);
  mass += sym;
  if (mass === 0) return 0;
  return round(Math.abs(moment / mass - RAIL_LENGTH_MM / 2) / 10, 2);
}

export function missingSubsystems(design: SpacecraftDesign): Subsystem[] {
  return ESSENTIAL_SUBSYSTEMS.filter((s) => !design.parts[s]);
}

export function nonHeritageParts(design: SpacecraftDesign): SpacecraftComponent[] {
  return installedParts(design).filter((c) => !c.flightHeritage);
}

/** Indicative science potential 0..1 for the selected objective (shown as a preview; real result comes from operations). */
export function sciencePreview(design: SpacecraftDesign, choices: MissionChoices, pkg: LaunchPackage | null, station: GroundStation | null): number {
  const cam = part(design, 'payload');
  const adcs = part(design, 'adcs');
  if (!cam || !adcs) return 0;
  const obj = objectiveById(choices.objective);
  if (obj.needsNir && cam.bands !== 'RGB+NIR') return 0.05;
  const alt = pkg?.altitudeKm ?? 500;
  const gsd = effectiveGsdM(cam, alt, Math.min(15, adcs.maxOffNadirDeg ?? 0));
  const gsdOk = gsd <= obj.maxGsdM ? 1 : clamp(obj.maxGsdM / gsd, 0, 1) * 0.5;
  const coverage = coverageFraction(cam, adcs.pointingErrorDeg ?? 90);
  const reach = clamp(((adcs.maxOffNadirDeg ?? 0) + (cam.fovHalfDeg ?? 0)) / 35, 0.15, 1);
  const mbPass = station ? mbPerReferencePass(design, station) : (part(design, 'radio')?.dataRateMbps ?? 0) * 30;
  const dl = clamp(mbPass / (cam.imageSizeMB ?? 1), 0, 1);
  const storage = clamp((part(design, 'storage')?.storageMB ?? 0) / ((cam.imageSizeMB ?? 1) * 4), 0, 1);
  return round(gsdOk * (coverage >= 0.7 ? 1 : coverage * 0.5) * (0.4 + 0.6 * reach) * (0.25 + 0.75 * dl) * (0.3 + 0.7 * storage), 3);
}

export interface EvaluateOptions {
  readonly choices: MissionChoices;
  readonly pkg: LaunchPackage | null;
  readonly station: GroundStation | null;
  readonly testsSpentCr: number | null;
  readonly purchases: Purchases;
  readonly calibrationErrorDeg?: number;
}

/** Full live evaluation used by the builder HUD and as the basis for verification tests. */
export function evaluateDesign(design: SpacecraftDesign, opts: EvaluateOptions): DesignReport {
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const missing = missingSubsystems(design);
  for (const s of missing) add({ code: 'design.missing', severity: 'fail', params: { subsystem: s }, remedy: 'install', sourceId: 'nasa-2.4' });

  const mass = totalMassKg(design);
  const massLimit = opts.pkg?.maxMassKg ?? DEFAULT_MAX_MASS_KG;
  if (mass > massLimit) add({ code: 'mass.over', severity: 'fail', params: { mass, limit: massLimit }, remedy: 'lighter', sourceId: 'nasa-6.4' });
  else if (mass > massLimit * (1 - MASS_MARGIN_WARN)) add({ code: 'mass.margin', severity: 'warning', params: { mass, limit: massLimit }, remedy: 'lighter', sourceId: 'nasa-6.4' });

  const vol = usedVolumeU(design);
  if (vol > USABLE_VOLUME_U) add({ code: 'vol.over', severity: 'fail', params: { used: vol, limit: USABLE_VOLUME_U }, remedy: 'smaller', sourceId: 'nasa-2.4' });

  const prot = maxProtrusionMm(design);
  const protLimit = opts.pkg?.maxProtrusionMm ?? MAX_PROTRUSION_MM;
  if (prot > protLimit) add({ code: 'env.protrusion', severity: 'fail', params: { mm: prot, limit: protLimit }, remedy: 'smaller', sourceId: 'nasa-2.4' });
  else if (prot > protLimit - 1) add({ code: 'env.nearLimit', severity: 'warning', params: { mm: prot, limit: protLimit }, sourceId: 'nasa-2.4' });

  const sunFrac = 0.62;
  const ref = referenceOrbit(design, sunFrac);
  const cap = batteryCapacityWh(design);
  const gen = sunlitGenerationW(design);
  const load = modeLoadW(design, 'nominal');
  if (!missing.includes('solar') && !missing.includes('battery')) {
    if (ref.orbitAverageMarginW < 0) add({ code: 'power.negative', severity: 'fail', params: { margin: round(ref.orbitAverageMarginW, 2), gen, load: round(load, 2) }, remedy: 'morePower', sourceId: 'nasa-6.5' });
    else if (ref.orbitAverageMarginW < 1) add({ code: 'power.thin', severity: 'warning', params: { margin: round(ref.orbitAverageMarginW, 2) }, remedy: 'morePower' });
    if (ref.imagingOrbitMinSocPct < 20) add({ code: 'power.eclipse', severity: 'warning', params: { soc: round(ref.imagingOrbitMinSocPct, 0) }, remedy: 'biggerBattery' });
  }

  const cam = part(design, 'payload');
  const adcs = part(design, 'adcs');
  const radio = part(design, 'radio');
  const storage = part(design, 'storage');
  const obj = objectiveById(opts.choices.objective);
  if (cam && storage) {
    const n = Math.floor((storage.storageMB ?? 0) / (cam.imageSizeMB ?? 1));
    if (n < 1) add({ code: 'storage.none', severity: 'fail', params: { size: cam.imageSizeMB ?? 0, storage: storage.storageMB ?? 0 }, remedy: 'moreStorage' });
    else if (n < 4) add({ code: 'storage.low', severity: 'warning', params: { n }, remedy: 'moreStorage' });
  }
  if (cam && obj.needsNir && cam.bands !== 'RGB+NIR') add({ code: 'obj.needsNir', severity: 'warning', remedy: 'nirCamera' });
  if (cam && opts.pkg) {
    const gsd = effectiveGsdM(cam, opts.pkg.altitudeKm, 0);
    if (gsd > obj.maxGsdM) add({ code: 'obj.gsd', severity: 'warning', params: { gsd: round(gsd, 0), limit: obj.maxGsdM }, remedy: 'sharperCamera' });
  } else if (cam && (cam.gsdAt500kmM ?? 999) > obj.maxGsdM) {
    add({ code: 'obj.gsd', severity: 'warning', params: { gsd: cam.gsdAt500kmM ?? 0, limit: obj.maxGsdM }, remedy: 'sharperCamera' });
  }
  if (cam && adcs) {
    const cov = coverageFraction(cam, adcs.pointingErrorDeg ?? 90);
    if (cov < 0.7) add({ code: 'adcs.coverage', severity: 'warning', params: { err: adcs.pointingErrorDeg ?? 0, fov: cam.fovHalfDeg ?? 0 }, remedy: 'betterAdcs', sourceId: 'nasa-2.4-adcs' });
  }
  if (radio && cam) {
    const mbPass = transferCapacityMB(radio.dataRateMbps ?? 0, REFERENCE_PASS_S, PROTOCOL_EFFICIENCY);
    if (mbPass < (cam.imageSizeMB ?? 0) / 10) add({ code: 'comm.slow', severity: 'warning', params: { passes: Math.ceil((cam.imageSizeMB ?? 0) / Math.max(1e-6, mbPass)) }, remedy: 'fasterRadio', sourceId: 'nasa-2.10' });
  }
  if (radio && adcs && satPointingFactor(design) < 0.9) add({ code: 'comm.pointing', severity: 'warning', params: { req: radio.requiredPointingDeg ?? 0, err: adcs.pointingErrorDeg ?? 0 }, remedy: 'betterAdcs' });
  if (opts.station && radio && !stationSupportsRadio(opts.station, design)) add({ code: 'comm.noBand', severity: 'fail', params: { band: radio.band ?? '?' }, remedy: 'matchStation', sourceId: 'nasa-2.10' });

  const restraint = part(design, 'restraint');
  if (restraint?.burnWires === 1 && installedParts(design).some((c) => c.deployable)) add({ code: 'restraint.single', severity: 'warning', remedy: 'dualBurnWire', sourceId: 'nasa-2.4' });
  const bat = part(design, 'battery');
  if (bat && !bat.ulListed && !opts.purchases.batteryQualification) add({ code: 'battery.notUl', severity: 'warning', remedy: 'qualifyBattery', sourceId: 'nasa-2.4' });
  const nh = nonHeritageParts(design).filter((c) => c.subsystem !== 'battery');
  if (nh.length && !opts.purchases.heritageQualification) add({ code: 'heritage.none', severity: 'warning', params: { parts: nh.map((c) => c.id).join(',') }, remedy: 'qualifyHeritage', sourceId: 'nasa-2.4' });

  const b = budget(design, opts.choices, opts.pkg, opts.station, opts.testsSpentCr, opts.purchases);
  if (b.committed > b.ceiling) add({ code: 'budget.over', severity: 'fail', params: { committed: b.committed, ceiling: b.ceiling }, remedy: 'cheaper', sourceId: 'nasa-2.2' });
  else if (b.reserveFraction < MISSION_RAJANG.reserveFraction) add({ code: 'budget.reserve', severity: 'warning', params: { pct: round(b.reserveFraction * 100, 1) }, remedy: 'cheaper', sourceId: 'nasa-2.2' });

  const metrics = {
    massKg: { value: mass, unit: 'kg', limit: massLimit },
    volumeU: { value: vol, unit: 'U', limit: USABLE_VOLUME_U },
    protrusionMm: { value: prot, unit: 'mm', limit: protLimit },
    hardwareCr: hardwareCostCr(design),
    idleLoadW: round(load, 2),
    sunlitGenerationW: gen,
    batteryWh: cap,
    orbitAverageMarginW: round(ref.orbitAverageMarginW, 2),
    eclipseEndSocPct: round(ref.eclipseEndSocPct, 1),
    imagingOrbitMinSocPct: round(ref.imagingOrbitMinSocPct, 1),
    storageMB: storage?.storageMB ?? 0,
    imagesStorable: cam && storage ? Math.floor((storage.storageMB ?? 0) / (cam.imageSizeMB ?? 1)) : 0,
    mbPerPass: round(opts.station ? mbPerReferencePass(design, opts.station, opts.calibrationErrorDeg ?? 0) : transferCapacityMB(radio?.dataRateMbps ?? 0, REFERENCE_PASS_S, PROTOCOL_EFFICIENCY), 2),
    cgOffsetCm: cgOffsetCm(design),
    sciencePreview: sciencePreview(design, opts.choices, opts.pkg, opts.station),
  };
  return { metrics, findings, complete: missing.length === 0 };
}

/** Preset builds used by tests, the Judge Demo and "Compare builds". */
export const PRESET_BUILDS: Record<'highScience' | 'balanced' | 'endurance', PartSelection> = {
  highScience: { payload: 'cam_ms', adcs: 'adcs_mtq', solar: 'solar_body', battery: 'bat_20', obc: 'obc_basic', storage: 'sto_512', radio: 'radio_uhf', restraint: 'bw_single', deorbit: null },
  balanced: { payload: 'cam_hd', adcs: 'adcs_rw', solar: 'solar_wing2', battery: 'bat_40', obc: 'obc_plus', storage: 'sto_4g', radio: 'radio_s', restraint: 'bw_dual', deorbit: null },
  endurance: { payload: 'cam_wide', adcs: 'adcs_passive', solar: 'solar_wing2', battery: 'bat_40', obc: 'obc_basic', storage: 'sto_4g', radio: 'radio_s', restraint: 'bw_dual', deorbit: null },
};

export function catalogFor(sub: Subsystem): readonly SpacecraftComponent[] {
  return CATALOG.filter((c) => c.subsystem === sub);
}

/** Stable JSON hash input for test invalidation. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
}
