import { describe, expect, test } from 'vitest';
import { FIXED_BUS, USABLE_VOLUME_U, getComponent } from '../../src/simulation/catalog';
import { budget, evaluateDesign, opsCostCr, totalMassKg, usedVolumeU, withPart, TOTAL_TEST_ESTIMATE_CR } from '../../src/simulation/design';
import { GROUND_STATIONS, MISSION_RAJANG, packageById } from '../../src/simulation/mission';
import { CHARGE_EFFICIENCY, DISCHARGE_EFFICIENCY, modeLoadW, stepBattery } from '../../src/simulation/power';
import { launchApproved, readinessGates, runTest, isTestCurrent, orbitalLifetimeYears, type VerificationContext } from '../../src/simulation/verification';
import type { TestId, TestResult } from '../../src/simulation/types';
import { BALANCED, GOOD_DITL, designOf } from './helpers';

const noPurchases = { batteryQualification: false, heritageQualification: false };
const choices = { mode: 'guided' as const, objective: 'landcover' as const, priorityZone: 'sibu' as const };

function vctx(parts = BALANCED, pkgId: 'polar' | 'station' | 'equatorial' = 'polar', extra: Partial<VerificationContext> = {}): VerificationContext {
  return { design: designOf({ ...parts, deorbit: pkgId === 'station' ? null : 'drag_sail' }), choices, pkg: packageById(pkgId), station: GROUND_STATIONS[1]!, purchases: noPurchases, calibrationErrorDeg: 0.3, ...extra };
}

function runAll(ctx: VerificationContext): Partial<Record<TestId, TestResult>> {
  const out: Partial<Record<TestId, TestResult>> = {};
  for (const id of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const) out[id] = runTest(id, ctx);
  return out;
}

describe('mass, volume and budget', () => {
  test('1. adding a component increases mass by exactly its specified mass', () => {
    const base = designOf({});
    const cam = getComponent('cam_hd')!;
    const after = withPart(base, 'payload', 'cam_hd');
    expect(totalMassKg(base)).toBeCloseTo(FIXED_BUS.massKg, 9);
    expect(totalMassKg(after) - totalMassKg(base)).toBeCloseTo(cam.massKg, 9);
  });

  test('2. a configuration exceeding usable volume is launch-incompatible', () => {
    const parts = { ...BALANCED, payload: 'cam_ms', adcs: 'adcs_rw', battery: 'bat_60x', radio: 'radio_x', storage: 'sto_16g' };
    const ctx = vctx(parts, 'polar', { purchases: { batteryQualification: true, heritageQualification: true } });
    expect(usedVolumeU(ctx.design)).toBeGreaterThan(USABLE_VOLUME_U);
    const t1 = runTest('T1', ctx);
    expect(t1.status).toBe('fail');
    expect(t1.findings.some((f) => f.code === 't1.doorBlocked')).toBe(true);
    const gates = readinessGates(ctx, runAll(ctx), 85);
    expect(launchApproved(gates)).toBe(false);
  });

  test('3. budget totals include hardware, ground, tests, launch, travel, ops and reserve', () => {
    const ctx = vctx();
    const b = budget(ctx.design, choices, ctx.pkg, ctx.station, null, noPurchases);
    const expected = b.hardware + ctx.pkg!.costCr + ctx.station!.costCr + TOTAL_TEST_ESTIMATE_CR + MISSION_RAJANG.travelCr + opsCostCr();
    expect(b.committed).toBe(expected);
    expect(b.reserve).toBe(MISSION_RAJANG.budgetCr.guided - expected);
    expect(b.reserveFraction).toBeCloseTo(b.reserve / MISSION_RAJANG.budgetCr.guided, 9);
    const withQual = budget(ctx.design, choices, ctx.pkg, ctx.station, null, { batteryQualification: true, heritageQualification: false });
    expect(withQual.committed - b.committed).toBe(25);
  });
});

describe('power and battery', () => {
  test('4. sunlight charging is capped at battery capacity', () => {
    let e = 39;
    for (let i = 0; i < 100; i++) e = stepBattery(e, 40, 20, 2, 60);
    expect(e).toBe(40);
  });

  test('5. eclipse discharge reduces Wh by load x time / discharge efficiency', () => {
    const e = stepBattery(30, 40, 0, 3, 3600);
    expect(e).toBeCloseTo(30 - 3 / DISCHARGE_EFFICIENCY, 9);
    const charged = stepBattery(10, 40, 5, 1, 3600);
    expect(charged).toBeCloseTo(10 + 4 * CHARGE_EFFICIENCY, 9);
    expect(stepBattery(0.1, 40, 0, 50, 3600)).toBe(0); // never negative
  });

  test('6. safe mode draws less power than nominal imaging mode', () => {
    const d = designOf(BALANCED);
    expect(modeLoadW(d, 'safe')).toBeLessThan(modeLoadW(d, 'nominal'));
    expect(modeLoadW(d, 'loadshed')).toBeLessThan(modeLoadW(d, 'nominal'));
  });

  test('7. an underpowered configuration produces a reproducible power failure', () => {
    const parts = { ...BALANCED, solar: 'solar_body', adcs: 'adcs_rw', payload: 'cam_ms' };
    const opts = { choices, pkg: packageById('polar'), station: GROUND_STATIONS[1]!, testsSpentCr: null, purchases: noPurchases };
    const a = evaluateDesign(designOf(parts), opts);
    const b = evaluateDesign(designOf(parts), opts);
    expect(a.findings.find((f) => f.code === 'power.negative')?.severity).toBe('fail');
    expect(a).toEqual(b);
    expect(runTest('T3', vctx(parts)).status).toBe('fail');
  });
});

describe('verification and readiness', () => {
  test('13. launch package incompatibility (mass) blocks readiness approval', () => {
    const heavy = { ...BALANCED, payload: 'cam_ms', solar: 'solar_wing4', radio: 'radio_x', battery: 'bat_40' };
    const ctx = vctx(heavy, 'equatorial', { purchases: { batteryQualification: false, heritageQualification: true }, station: GROUND_STATIONS[2]! });
    expect(totalMassKg(ctx.design)).toBeGreaterThan(packageById('equatorial').maxMassKg);
    expect(runTest('T2', ctx).status).toBe('fail');
    expect(launchApproved(readinessGates(ctx, runAll(ctx), 85))).toBe(false);
  });

  test('a fully valid design passes every critical gate', () => {
    const ctx = vctx();
    const results = runAll(ctx);
    const gates = readinessGates(ctx, results, 85);
    expect(gates.filter((g) => g.critical && !g.passed)).toEqual([]);
    expect(launchApproved(gates)).toBe(true);
  });

  test('changing hardware after testing invalidates the affected tests (NASA §2.11 retest rule)', () => {
    const ctx = vctx();
    const t1 = runTest('T1', ctx);
    const t7 = runTest('T7', ctx);
    const changed = { ...ctx, design: withPart(ctx.design, 'storage', 'sto_16g') };
    expect(isTestCurrent(t1, changed)).toBe(false);
    expect(isTestCurrent(t7, changed)).toBe(true);
  });

  test('DITL: a timer does not count as an inhibit and transmissions must wait for the ICD minimum', () => {
    const ctx = vctx(BALANCED, 'station', {});
    const bad = { ...ctx, design: { ...ctx.design, ditl: { ...GOOD_DITL, separationSwitches: 2 as const, txDelayMin: 10 } } };
    const r = runTest('T4', bad);
    expect(r.status).toBe('fail');
    expect(r.findings.map((f) => f.code)).toEqual(expect.arrayContaining(['t4.inhibits', 't4.txEarly']));
  });

  test('single burn wire with deployable wings fails vibration review; dual passes', () => {
    expect(runTest('T5', vctx({ ...BALANCED, restraint: 'bw_single' })).status).toBe('fail');
    expect(runTest('T5', vctx(BALANCED)).status).toBe('pass');
  });

  test('debris: higher orbits need a deorbit device to meet the 5-year policy', () => {
    expect(orbitalLifetimeYears(600)).toBeGreaterThan(5);
    expect(orbitalLifetimeYears(600, 0.08)).toBeLessThan(5);
    const noSail = { ...vctx(BALANCED, 'equatorial'), design: designOf({ ...BALANCED, deorbit: null }) };
    expect(runTest('T7', noSail).status).toBe('fail');
  });

  test('19. a failed readiness can always be recovered by fixing the design and re-testing', () => {
    const broken = vctx({ ...BALANCED, restraint: 'bw_single' });
    expect(launchApproved(readinessGates(broken, runAll(broken), 85))).toBe(false);
    const fixed = { ...broken, design: withPart(broken.design, 'restraint', 'bw_dual') };
    expect(launchApproved(readinessGates(fixed, runAll(fixed), 125))).toBe(true);
  });
});
