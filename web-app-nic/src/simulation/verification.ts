// Pre-launch verification tests T1–T7 and the Mission Readiness Review (MRR) gates.
// Grounded in NASA CubeSat 101 §2.11–2.12 and §6 (process), with simplified pass/fail models.
import { USABLE_VOLUME_U } from './catalog';
import {
  CG_LIMIT_CM,
  MASS_MARGIN_WARN,
  TEST_COST_CR,
  budget,
  cgOffsetCm,
  evaluateDesign,
  groundPointingFactor,
  hasDeployables,
  installedParts,
  maxProtrusionMm,
  mbPerReferencePass,
  missingSubsystems,
  nonHeritageParts,
  stableKey,
  stationSupportsRadio,
  totalMassKg,
  usedVolumeU,
} from './design';
import { MISSION_RAJANG } from './mission';
import { part, referenceOrbit } from './power';
import { round } from './rng';
import type { Finding, Gate, GroundStation, LaunchPackage, MissionChoices, Purchases, Severity, SpacecraftDesign, TestId, TestResult } from './types';

export const TEST_IDS: readonly TestId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Educational debris-policy threshold for this game (inspired by today's 5-year post-mission disposal practice). */
export const DISPOSAL_LIMIT_YEARS = 5;

/** Rough natural-decay lifetime for a ~4 kg 3U at moderate solar activity (order-of-magnitude, EDUCATIONAL_SIMPLIFICATION). */
const LIFETIME_TABLE: readonly (readonly [number, number])[] = [
  [350, 0.4],
  [400, 1.0],
  [450, 2.5],
  [500, 4.5],
  [550, 9],
  [600, 20],
  [650, 40],
];

export function orbitalLifetimeYears(altitudeKm: number, lifetimeFactor = 1): number {
  const t = LIFETIME_TABLE;
  let years: number;
  if (altitudeKm <= t[0]![0]) years = t[0]![1];
  else if (altitudeKm >= t[t.length - 1]![0]) years = t[t.length - 1]![1];
  else {
    let i = 0;
    while (t[i + 1]![0] < altitudeKm) i++;
    const [a0, y0] = t[i]!;
    const [a1, y1] = t[i + 1]!;
    const f = (altitudeKm - a0) / (a1 - a0);
    years = Math.exp(Math.log(y0) + f * (Math.log(y1) - Math.log(y0)));
  }
  return round(years * lifetimeFactor, 2);
}

export interface VerificationContext {
  readonly design: SpacecraftDesign;
  readonly choices: MissionChoices;
  readonly pkg: LaunchPackage | null;
  readonly station: GroundStation | null;
  readonly purchases: Purchases;
  readonly calibrationErrorDeg: number | null;
}

const worst = (fs: readonly Finding[]): Severity => (fs.some((f) => f.severity === 'fail') ? 'fail' : fs.some((f) => f.severity === 'warning') ? 'warning' : 'pass');

/** Inputs each test depends on. Changing them after a test invalidates that test (NASA §2.11, §6.9: retest after changes). */
export function testInputHash(id: TestId, ctx: VerificationContext): string {
  const hw = ctx.design.parts;
  switch (id) {
    case 'T1':
      return stableKey({ id, hw, pkg: ctx.pkg?.id ?? null, rbf: ctx.design.ditl.rbfPin });
    case 'T2':
      return stableKey({ id, hw, pkg: ctx.pkg?.id ?? null });
    case 'T3':
      return stableKey({ id, hw, q: ctx.purchases.batteryQualification });
    case 'T4':
      return stableKey({ id, ditl: ctx.design.ditl, pkg: ctx.pkg?.id ?? null, hw });
    case 'T5':
      return stableKey({ id, hw, q: ctx.purchases.heritageQualification });
    case 'T6':
      return stableKey({ id, radio: hw.radio, adcs: hw.adcs, st: ctx.station?.id ?? null, cal: ctx.calibrationErrorDeg });
    case 'T7':
      return stableKey({ id, pkg: ctx.pkg?.id ?? null, deorbit: hw.deorbit });
  }
}

function t1Fit(ctx: VerificationContext): Finding[] {
  const f: Finding[] = [];
  const used = usedVolumeU(ctx.design);
  const prot = maxProtrusionMm(ctx.design);
  const limit = ctx.pkg?.maxProtrusionMm ?? 6.5;
  if (used > USABLE_VOLUME_U) f.push({ code: 't1.doorBlocked', severity: 'fail', params: { used, limit: USABLE_VOLUME_U, mm: prot }, remedy: 'smaller', sourceId: 'nasa-6.6' });
  else if (prot > limit) f.push({ code: 't1.protrusion', severity: 'fail', params: { mm: prot, limit }, remedy: 'smaller', sourceId: 'nasa-2.4' });
  else if (prot > limit - 1) f.push({ code: 't1.nearLimit', severity: 'warning', params: { mm: prot, limit }, sourceId: 'nasa-2.4' });
  if (!ctx.design.ditl.rbfPin) f.push({ code: 't1.noRbf', severity: 'fail', remedy: 'addRbf', sourceId: 'nasa-6.7' });
  f.push({ code: 't1.dims', severity: 'pass', params: { width: 100.0, length: used > USABLE_VOLUME_U ? round(340.5 + prot, 1) : 340.5 }, sourceId: 'nasa-appc' });
  return f;
}

function t2Mass(ctx: VerificationContext): Finding[] {
  const f: Finding[] = [];
  const mass = totalMassKg(ctx.design);
  const limit = ctx.pkg?.maxMassKg ?? 4.0;
  if (!ctx.pkg) f.push({ code: 't2.noPackage', severity: 'fail', remedy: 'choosePackage' });
  if (mass > limit) f.push({ code: 't2.over', severity: 'fail', params: { mass, limit }, remedy: 'lighter', sourceId: 'nasa-6.4' });
  else if (mass > limit * (1 - MASS_MARGIN_WARN)) f.push({ code: 't2.margin', severity: 'warning', params: { mass, limit }, sourceId: 'nasa-6.4' });
  else f.push({ code: 't2.ok', severity: 'pass', params: { mass, limit }, sourceId: 'nasa-6.4' });
  const cg = cgOffsetCm(ctx.design);
  if (cg > CG_LIMIT_CM) f.push({ code: 't2.cg', severity: 'fail', params: { cg, limit: CG_LIMIT_CM }, remedy: 'rebalance' });
  else f.push({ code: 't2.cgOk', severity: 'pass', params: { cg, limit: CG_LIMIT_CM } });
  return f;
}

function t3Battery(ctx: VerificationContext): Finding[] {
  const f: Finding[] = [];
  const bat = part(ctx.design, 'battery');
  if (!bat) return [{ code: 'design.missing', severity: 'fail', params: { subsystem: 'battery' }, remedy: 'install' }];
  if (!bat.ulListed && !ctx.purchases.batteryQualification) f.push({ code: 't3.notUl', severity: 'fail', remedy: 'qualifyBattery', sourceId: 'nasa-2.4' });
  else f.push({ code: 't3.protection', severity: 'pass', sourceId: 'nasa-6.5' });
  const ref = referenceOrbit(ctx.design);
  if (ref.orbitAverageMarginW < 0) f.push({ code: 't3.negative', severity: 'fail', params: { margin: round(ref.orbitAverageMarginW, 2) }, remedy: 'morePower' });
  else if (ref.imagingOrbitMinSocPct < 20) f.push({ code: 't3.eclipseLow', severity: 'warning', params: { soc: round(ref.imagingOrbitMinSocPct, 0) }, remedy: 'biggerBattery' });
  else f.push({ code: 't3.eclipseOk', severity: 'pass', params: { soc: round(ref.imagingOrbitMinSocPct, 0), margin: round(ref.orbitAverageMarginW, 2) } });
  return f;
}

function t4Ditl(ctx: VerificationContext): Finding[] {
  const f: Finding[] = [];
  const d = ctx.design.ditl;
  const pkg = ctx.pkg;
  if (!pkg) return [{ code: 't2.noPackage', severity: 'fail', remedy: 'choosePackage' }];
  // NASA CubeSat 101 §6.7: "A timer is not considered an independent inhibit." Only separation switches count here.
  if (d.separationSwitches < pkg.minInhibits) f.push({ code: 't4.inhibits', severity: 'fail', params: { have: d.separationSwitches, need: pkg.minInhibits }, remedy: 'addInhibit', sourceId: 'nasa-6.7' });
  if (d.deployDelayMin < pkg.minDeployDelayMin) f.push({ code: 't4.deployEarly', severity: 'fail', params: { have: d.deployDelayMin, need: pkg.minDeployDelayMin }, remedy: 'timer', sourceId: 'nasa-6.9.1' });
  if (d.txDelayMin < pkg.minTxDelayMin) f.push({ code: 't4.txEarly', severity: 'fail', params: { have: d.txDelayMin, need: pkg.minTxDelayMin }, remedy: 'timer', sourceId: 'nasa-6.9.1' });
  if (hasDeployables(ctx.design) && d.txDelayMin < d.deployDelayMin) f.push({ code: 't4.txBeforeAntenna', severity: 'fail', params: { tx: d.txDelayMin, dep: d.deployDelayMin }, remedy: 'timer' });
  if (!d.rbfPin) f.push({ code: 't1.noRbf', severity: 'fail', remedy: 'addRbf', sourceId: 'nasa-6.7' });
  if (!f.length) f.push({ code: 't4.ok', severity: 'pass', params: { dep: d.deployDelayMin, tx: d.txDelayMin, inh: d.separationSwitches }, sourceId: 'nasa-6.9.1' });
  return f;
}

function t5Environment(ctx: VerificationContext): Finding[] {
  const f: Finding[] = [];
  const restraint = part(ctx.design, 'restraint');
  const heavyDeployables = installedParts(ctx.design).some((c) => c.deployable && c.subsystem === 'solar');
  if (!restraint) f.push({ code: 'design.missing', severity: 'fail', params: { subsystem: 'restraint' }, remedy: 'install' });
  else if (restraint.burnWires === 1 && heavyDeployables) f.push({ code: 't5.release', severity: 'fail', remedy: 'dualBurnWire', sourceId: 'nasa-2.4' });
  else if (restraint.burnWires === 1) f.push({ code: 't5.singleWire', severity: 'warning', remedy: 'dualBurnWire', sourceId: 'nasa-2.4' });
  const nh = nonHeritageParts(ctx.design).filter((c) => c.subsystem !== 'battery');
  if (nh.length && !ctx.purchases.heritageQualification) f.push({ code: 't5.heritage', severity: 'fail', params: { parts: nh.map((c) => c.id).join(',') }, remedy: 'qualifyHeritage', sourceId: 'nasa-2.4' });
  f.push({ code: 't5.tvac', severity: 'pass', sourceId: 'nasa-6.9.3' });
  if (!f.some((x) => x.severity === 'fail')) f.push({ code: 't5.ok', severity: 'pass', sourceId: 'nasa-6.9.2' });
  return f;
}

function t6Comms(ctx: VerificationContext): Finding[] {
  const f: Finding[] = [];
  const radio = part(ctx.design, 'radio');
  if (!ctx.station) return [{ code: 't6.noStation', severity: 'fail', remedy: 'chooseStation', sourceId: 'nasa-2.10' }];
  if (!radio) return [{ code: 'design.missing', severity: 'fail', params: { subsystem: 'radio' }, remedy: 'install' }];
  if (!stationSupportsRadio(ctx.station, ctx.design)) f.push({ code: 'comm.noBand', severity: 'fail', params: { band: radio.band ?? '?' }, remedy: 'matchStation', sourceId: 'nasa-2.10' });
  if (ctx.calibrationErrorDeg === null) f.push({ code: 't6.noCal', severity: 'fail', remedy: 'calibrate', sourceId: 'nasa-2.10' });
  else {
    const g = groundPointingFactor(ctx.station, ctx.calibrationErrorDeg);
    if (g < 0.5) f.push({ code: 't6.calPoor', severity: 'fail', params: { err: round(ctx.calibrationErrorDeg, 2), loss: round(-10 * Math.log10(g), 1) }, remedy: 'calibrate', sourceId: 'nasa-2.10' });
    else f.push({ code: 't6.calOk', severity: 'pass', params: { err: round(ctx.calibrationErrorDeg, 2), loss: round(-10 * Math.log10(g), 1) } });
  }
  const cam = part(ctx.design, 'payload');
  const mb = mbPerReferencePass(ctx.design, ctx.station, ctx.calibrationErrorDeg ?? 0);
  if (cam && mb > 0 && mb < (cam.imageSizeMB ?? 0) / 10) f.push({ code: 't6.slow', severity: 'warning', params: { mb: round(mb, 2), size: cam.imageSizeMB ?? 0 }, remedy: 'fasterRadio' });
  if (!f.some((x) => x.severity === 'fail')) f.push({ code: 't6.handshake', severity: 'pass', params: { mb: round(mb, 1) } });
  return f;
}

function t7Debris(ctx: VerificationContext): Finding[] {
  if (!ctx.pkg) return [{ code: 't2.noPackage', severity: 'fail', remedy: 'choosePackage' }];
  const factor = part(ctx.design, 'deorbit')?.lifetimeFactor ?? 1;
  const years = orbitalLifetimeYears(ctx.pkg.altitudeKm, factor);
  const f: Finding[] = [];
  if (years > DISPOSAL_LIMIT_YEARS) f.push({ code: 't7.lifetime', severity: 'fail', params: { years, limit: DISPOSAL_LIMIT_YEARS }, remedy: 'dragSail', sourceId: 'nasa-6.1' });
  else if (years > DISPOSAL_LIMIT_YEARS * 0.8) f.push({ code: 't7.close', severity: 'warning', params: { years, limit: DISPOSAL_LIMIT_YEARS }, sourceId: 'nasa-6.1' });
  else f.push({ code: 't7.ok', severity: 'pass', params: { years, limit: DISPOSAL_LIMIT_YEARS }, sourceId: 'nasa-6.1' });
  f.push({ code: 't7.materials', severity: 'pass', sourceId: 'nasa-6.1' });
  return f;
}

export function runTest(id: TestId, ctx: VerificationContext): TestResult {
  const findings = (() => {
    switch (id) {
      case 'T1':
        return t1Fit(ctx);
      case 'T2':
        return t2Mass(ctx);
      case 'T3':
        return t3Battery(ctx);
      case 'T4':
        return t4Ditl(ctx);
      case 'T5':
        return t5Environment(ctx);
      case 'T6':
        return t6Comms(ctx);
      case 'T7':
        return t7Debris(ctx);
    }
  })();
  return { id, status: worst(findings), findings, costCr: TEST_COST_CR[id], inputHash: testInputHash(id, ctx) };
}

export function isTestCurrent(result: TestResult | undefined, ctx: VerificationContext): boolean {
  return !!result && result.inputHash === testInputHash(result.id, ctx);
}

/** Mission Readiness Review gates. Critical gates must all pass before launch (GO / NO-GO). */
export function readinessGates(ctx: VerificationContext, results: Partial<Record<TestId, TestResult>>, testsSpentCr: number): Gate[] {
  const gates: Gate[] = [];
  const missing = missingSubsystems(ctx.design);
  gates.push({ id: 'subsystems', critical: true, passed: missing.length === 0, findings: missing.map((s) => ({ code: 'design.missing', severity: 'fail' as const, params: { subsystem: s }, remedy: 'install' })) });
  for (const id of TEST_IDS) {
    const r = results[id];
    const current = isTestCurrent(r, ctx);
    const findings: Finding[] = !r
      ? [{ code: 'mrr.notRun', severity: 'fail', params: { test: id }, remedy: 'runTest' }]
      : !current
        ? [{ code: 'mrr.invalidated', severity: 'fail', params: { test: id }, remedy: 'runTest', sourceId: 'nasa-2.11' }]
        : r.findings.filter((f) => f.severity !== 'pass');
    gates.push({ id, critical: true, passed: !!r && current && r.status !== 'fail', findings });
  }
  const b = budget(ctx.design, ctx.choices, ctx.pkg, ctx.station, testsSpentCr, ctx.purchases);
  gates.push({ id: 'budget', critical: true, passed: b.committed <= b.ceiling, findings: b.committed <= b.ceiling ? [] : [{ code: 'budget.over', severity: 'fail', params: { committed: b.committed, ceiling: b.ceiling }, remedy: 'cheaper' }] });
  const reserveOk = b.reserveFraction >= MISSION_RAJANG.reserveFraction;
  gates.push({ id: 'reserve', critical: true, passed: reserveOk, findings: reserveOk ? [] : [{ code: 'budget.reserve', severity: 'fail', params: { pct: round(b.reserveFraction * 100, 1) }, remedy: 'cheaper', sourceId: 'nasa-2.2' }] });
  gates.push({ id: 'package', critical: true, passed: !!ctx.pkg, findings: ctx.pkg ? [] : [{ code: 't2.noPackage', severity: 'fail', remedy: 'choosePackage' }] });
  gates.push({ id: 'station', critical: true, passed: !!ctx.station, findings: ctx.station ? [] : [{ code: 't6.noStation', severity: 'fail', remedy: 'chooseStation' }] });
  const report = evaluateDesign(ctx.design, { choices: ctx.choices, pkg: ctx.pkg, station: ctx.station, testsSpentCr, purchases: ctx.purchases });
  const sciWarnings = report.findings.filter((f) => f.code.startsWith('obj.') || f.code === 'comm.slow' || f.code === 'adcs.coverage');
  gates.push({ id: 'science', critical: false, passed: sciWarnings.length === 0, findings: sciWarnings });
  return gates;
}

export function launchApproved(gates: readonly Gate[]): boolean {
  return gates.filter((g) => g.critical).every((g) => g.passed);
}
