import { describe, expect, test } from 'vitest';
import { LAUNCH_PACKAGES, packageById } from '../../src/simulation/mission';
import { EARTH_RADIUS_KM, MU_KM3_S2, buildScenario, elementsFor, subSatellitePoint } from '../../src/simulation/orbit';
import { autoPlay } from '../../src/simulation/ops';
import { SAVE_VERSION, defaultSave, deserialize, migrate, newProgress, serialize } from '../../src/state/saveSchema';
import { BALANCED, ctxFor, sensiblePolicy } from './helpers';

describe('orbit model', () => {
  test('orbital period matches Kepler within 0.5% (J2 correction is small)', () => {
    for (const p of LAUNCH_PACKAGES) {
      const a = EARTH_RADIUS_KM + p.altitudeKm;
      const kepler = 2 * Math.PI * Math.sqrt(a ** 3 / MU_KM3_S2);
      expect(Math.abs(elementsFor(p).periodS - kepler) / kepler).toBeLessThan(0.005);
    }
  });

  test('sun-synchronous package drifts ~0.9856 deg/day eastward', () => {
    const el = elementsFor(packageById('polar'));
    const degPerDay = (el.raanDot * 86400 * 180) / Math.PI;
    expect(degPerDay).toBeGreaterThan(0.9);
    expect(degPerDay).toBeLessThan(1.07);
  });

  test('ground track latitude never exceeds the inclination', () => {
    for (const p of LAUNCH_PACKAGES) {
      const el = elementsFor(p);
      const maxLat = p.inclinationDeg > 90 ? 180 - p.inclinationDeg : p.inclinationDeg;
      for (let t = 0; t < 86400; t += 300) expect(Math.abs(subSatellitePoint(el, t).lat)).toBeLessThanOrEqual(maxLat + 0.01);
    }
  });

  test('scenarios are multi-day and Rajang is NOT visible on every orbit', () => {
    for (const p of LAUNCH_PACKAGES) {
      const s = buildScenario(p);
      const orbits = s.durationS / s.periodS;
      const events = new Set(s.targetPasses.map((x) => Math.round(x.tca / 900))).size;
      expect(events).toBeLessThan(orbits / 5);
      expect(s.eclipses.length).toBeGreaterThan(orbits * 0.9);
      expect(s.sunlitFraction).toBeGreaterThan(0.55);
      expect(s.sunlitFraction).toBeLessThan(0.75);
    }
  });

  test('packages genuinely differ in target access and contact opportunities', () => {
    const contacts = LAUNCH_PACKAGES.map((p) => buildScenario(p).contacts.length);
    expect(new Set(contacts).size).toBe(3);
  });
});

describe('saves', () => {
  test('17. a saved mid-mission run round-trips without losing state', () => {
    const ctx = ctxFor(BALANCED);
    const rt = autoPlay(ctx, sensiblePolicy(ctx));
    const save = { ...defaultSave(), progress: { ...newProgress(ctx.choices), phase: 'ops' as const, design: ctx.design, pkgId: 'polar' as const, runtime: rt }, achievements: ['first_contact'] };
    const restored = deserialize(serialize(save));
    expect(restored.progress?.runtime).toEqual(rt);
    expect(restored.progress?.phase).toBe('ops');
    expect(restored.achievements).toEqual(['first_contact']);
  });

  test('corrupt, future or legacy saves are handled safely', () => {
    expect(deserialize('{not json')).toEqual(defaultSave());
    expect(migrate({ version: SAVE_VERSION + 1 })).toEqual(defaultSave());
    const legacy = migrate({ version: 0, settings: { locale: 'ms' } });
    expect(legacy.settings.locale).toBe('ms');
    expect(legacy.settings.sfxVolume).toBeGreaterThan(0);
    expect(legacy.version).toBe(SAVE_VERSION);
  });
});
