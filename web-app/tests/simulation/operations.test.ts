import { describe, expect, test } from 'vitest';
import { PRESET_BUILDS, transferCapacityMB } from '../../src/simulation/design';
import { objectiveById } from '../../src/simulation/mission';
import { observationQuality, unusableReason, captureGeometry } from '../../src/simulation/observations';
import { getComponent } from '../../src/simulation/catalog';
import {
  advanceTo,
  autoPlay,
  captureBlockedReason,
  contactCapacityMB,
  initRuntime,
  nextDecision,
  performCapture,
  performPass,
  resolveDecision,
  storageCapacityMB,
  storageUsedMB,
  accessiblePasses,
} from '../../src/simulation/ops';
import { evaluateOutcome } from '../../src/simulation/score';
import type { MissionRuntime } from '../../src/simulation/types';
import { BALANCED, ctxFor, greedyPolicy, sensiblePolicy } from './helpers';

const iter = { testFailuresFixed: 0, testsSpentCr: 85, purchases: { batteryQualification: false, heritageQualification: true } };

function commissioned(ctx: ReturnType<typeof ctxFor>): MissionRuntime {
  const { rt, decision } = nextDecision(initRuntime(ctx), ctx);
  expect(decision.kind).toBe('firstContact');
  return resolveDecision(rt, ctx, decision, 'ack');
}

describe('storage and downlink', () => {
  test('8. storage saturation blocks further captures', () => {
    const ctx = ctxFor({ ...BALANCED, storage: 'sto_512' });
    let rt = commissioned(ctx);
    const passes = accessiblePasses(ctx).filter((p) => p.tca > rt.t);
    let blocked = false;
    for (const p of passes) {
      if (captureBlockedReason(rt, ctx, p) === 'storage') {
        blocked = true;
        break;
      }
      rt = performCapture(rt, ctx, p);
    }
    expect(blocked).toBe(true);
    expect(storageUsedMB(rt)).toBeLessThanOrEqual(storageCapacityMB(ctx.design));
  });

  test('9. a pass never sends more than rate x time x efficiency, nor more than stored data', () => {
    const ctx = ctxFor(BALANCED);
    let rt = commissioned(ctx);
    const pass = accessiblePasses(ctx).find((p) => p.tca > rt.t)!;
    rt = performCapture(rt, ctx, pass);
    const stored = storageUsedMB(rt);
    const contact = ctx.scenario.contacts.find((c) => c.start > rt.t && c.stationId !== 'partner_miri')!;
    const after = performPass(rt, ctx, contact, 1);
    const rec = after.transfers[after.transfers.length - 1]!;
    const maxByLink = transferCapacityMB(2, contact.end - contact.start, 1);
    expect(rec.sentMB).toBeLessThanOrEqual(rec.capacityMB + 1e-9);
    expect(rec.capacityMB).toBeLessThanOrEqual(maxByLink + 1e-9);
    expect(rec.sentMB).toBeLessThanOrEqual(stored + 1e-9);
  });

  test('10. no data can be transferred outside a contact window', () => {
    const ctx = ctxFor(BALANCED);
    const c = ctx.scenario.contacts[0]!;
    expect(contactCapacityMB(c, ctx, c.end + 1)).toBe(0);
    const rt = autoPlay(ctx, sensiblePolicy(ctx));
    for (const tr of rt.transfers) {
      const win = ctx.scenario.contacts.find((x) => x.id === tr.contactId)!;
      expect(tr.t).toBeGreaterThanOrEqual(win.start);
      expect(tr.t + tr.durationS).toBeLessThanOrEqual(win.end + 1e-6);
    }
  });
});

describe('science usefulness', () => {
  test('11. cloudy optical observations are unusable above the declared threshold', () => {
    const obj = objectiveById('landcover');
    const cam = getComponent('cam_wide')!;
    expect(unusableReason({ cloud: obj.maxCloud + 0.01, coverage: 1, gsdM: 50 }, obj, cam)).toBe('cloud');
    expect(unusableReason({ cloud: obj.maxCloud - 0.01, coverage: 1, gsdM: 50 }, obj, cam)).toBeNull();
  });

  test('12. missing pointing capability reduces science quality', () => {
    const cam = getComponent('cam_hd')!;
    const pass = ctxFor(BALANCED).scenario.targetPasses[0]!;
    const passive = captureGeometry(cam, getComponent('adcs_passive')!, 5, 500, 1);
    const wheels = captureGeometry(cam, getComponent('adcs_rw')!, 5, 500, 1);
    const obj = objectiveById('landcover');
    expect(passive.coverage).toBeLessThan(wheels.coverage);
    expect(observationQuality(0.1, passive.coverage, passive.gsdM, obj, false, 'RGB')).toBeLessThan(observationQuality(0.1, wheels.coverage, wheels.gsdM, obj, false, 'RGB'));
    expect(pass).toBeDefined();
  });

  test('16. score and outcome count returned science, not just recorded imagery', () => {
    const ctx = ctxFor(BALANCED);
    let rt = commissioned(ctx);
    for (const p of accessiblePasses(ctx).filter((x) => x.tca > rt.t)) if (!captureBlockedReason(rt, ctx, p)) rt = performCapture(rt, ctx, p);
    expect(rt.observations.length).toBeGreaterThan(0);
    const out = evaluateOutcome({ ...rt, ended: true }, ctx, iter);
    expect(out.usableReturned).toBe(0); // nothing downlinked yet
    expect(out.kind).toBe('failure');
  });
});

describe('whole-mission behaviour', () => {
  test('14. three representative builds have meaningfully different outcomes', () => {
    const results = (['highScience', 'balanced', 'endurance'] as const).map((k) => {
      const ctx = ctxFor(PRESET_BUILDS[k]);
      const rt = autoPlay(ctx, sensiblePolicy(ctx));
      return { k, rt, out: evaluateOutcome(rt, ctx, iter) };
    });
    const [hs, bal, end] = results;
    // High-science + UHF-only: data stuck on board (downlink bottleneck).
    expect(hs!.out.usableReturned).toBe(0);
    expect(hs!.rt.observations.length).toBeGreaterThan(0);
    // Balanced build returns the required science.
    expect(bal!.out.kind).toBe('success');
    // Endurance build: big power margin but weaker science than balanced.
    expect(end!.out.usableReturned).toBeLessThan(bal!.out.usableReturned);
    expect(new Set(results.map((r) => r.out.score.total)).size).toBe(3);
  });

  test('different orbits change the outcome for the same spacecraft', () => {
    const outcomes = (['station', 'polar', 'equatorial'] as const).map((pkg) => {
      const ctx = ctxFor(BALANCED, { pkg, objective: 'detail' });
      return evaluateOutcome(autoPlay(ctx, sensiblePolicy(ctx)), ctx, iter).kind;
    });
    expect(new Set(outcomes).size).toBeGreaterThan(1);
  });

  test('15. a fixed seed reproduces identical mission results', () => {
    const a = autoPlay(ctxFor(BALANCED, { seed: 42 }), sensiblePolicy(ctxFor(BALANCED, { seed: 42 })));
    const b = autoPlay(ctxFor(BALANCED, { seed: 42 }), sensiblePolicy(ctxFor(BALANCED, { seed: 42 })));
    expect(a).toEqual(b);
    const c = autoPlay(ctxFor(BALANCED, { seed: 43 }), sensiblePolicy(ctxFor(BALANCED, { seed: 43 })));
    expect(c.observations.map((o) => o.cloud)).not.toEqual(a.observations.map((o) => o.cloud));
  });

  test('anomaly engine: at least one condition-based incident occurs for typical builds', () => {
    for (const k of ['balanced', 'highScience'] as const) {
      const ctx = ctxFor(PRESET_BUILDS[k]);
      const rt = autoPlay(ctx, sensiblePolicy(ctx));
      expect(rt.anomaliesTriggered.length).toBeGreaterThan(0);
    }
  });

  test('eclipse energy deficit triggers from a low battery and the chosen response changes the energy outcome', () => {
    const ctx = ctxFor(BALANCED);
    const rt0 = commissioned(ctx);
    const nextEcl = ctx.scenario.eclipses.find((e) => e.start > rt0.t + 120)!;
    const low = { ...advanceTo(rt0, ctx, nextEcl.start - 60), batteryWh: 40 * 0.33 };
    const { rt, decision } = nextDecision(low, ctx);
    expect(decision.kind).toBe('eclipseDeficit');
    if (decision.kind !== 'eclipseDeficit') return;
    expect(Number(decision.params['socShed'])).toBeGreaterThan(Number(decision.params['socNominal']));
    const ecl = ctx.scenario.eclipses.find((e) => e.start >= rt.t)!;
    const stay = advanceTo(resolveDecision(rt, ctx, decision, 'stayNominal'), ctx, ecl.end);
    const shed = advanceTo(resolveDecision(rt, ctx, decision, 'shedLoad'), ctx, ecl.end);
    expect(shed.batteryWh).toBeGreaterThan(stay.batteryWh);
    expect(shed.mode).toBe('loadshed');
  });

  test('20. no NaN, negative energy, negative storage or time going backwards', () => {
    for (const k of ['highScience', 'balanced', 'endurance'] as const) {
      for (const pkg of ['station', 'polar', 'equatorial'] as const) {
        const ctx = ctxFor(PRESET_BUILDS[k], { pkg });
        const rt = autoPlay(ctx, greedyPolicy());
        expect(Number.isFinite(rt.batteryWh)).toBe(true);
        expect(rt.batteryWh).toBeGreaterThanOrEqual(0);
        expect(storageUsedMB(rt)).toBeGreaterThanOrEqual(0);
        let lastT = -1;
        for (const h of rt.history) {
          expect(Number.isFinite(h.socPct)).toBe(true);
          expect(h.socPct).toBeGreaterThanOrEqual(0);
          expect(h.socPct).toBeLessThanOrEqual(100.0001);
          expect(h.t).toBeGreaterThanOrEqual(lastT);
          lastT = h.t;
        }
        for (const o of rt.observations) {
          expect(o.bytesDownMB).toBeGreaterThanOrEqual(0);
          expect(o.bytesDownMB).toBeLessThanOrEqual(o.sizeMB + 1e-6);
          expect(Number.isFinite(o.quality)).toBe(true);
        }
        expect(rt.ended).toBe(true);
      }
    }
  });
});
