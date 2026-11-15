import { describe, expect, test } from 'vitest';
import { DICTIONARIES, findingText, translate } from '../../src/i18n';
import { evaluateDesign } from '../../src/simulation/design';
import { GROUND_STATIONS, packageById } from '../../src/simulation/mission';
import { autoPlay } from '../../src/simulation/ops';
import { evaluateOutcome } from '../../src/simulation/score';
import { BALANCED, ctxFor, designOf, sensiblePolicy } from './helpers';

describe('localization', () => {
  test('English and Bahasa Melayu define exactly the same keys', () => {
    const en = Object.keys(DICTIONARIES.en).sort();
    const ms = Object.keys(DICTIONARIES.ms).sort();
    expect(ms.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !ms.includes(k))).toEqual([]);
  });

  test('placeholders match between languages', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    for (const k of Object.keys(DICTIONARIES.en)) expect(ph(DICTIONARIES.ms[k]!), k).toBe(ph(DICTIONARIES.en[k]!));
  });

  test('every finding and log code produced by the simulation has a translation', () => {
    const ctx = ctxFor(BALANCED);
    const rt = autoPlay(ctx, sensiblePolicy(ctx));
    for (const e of rt.log) expect(DICTIONARIES.en[e.code], e.code).toBeDefined();
    const out = evaluateOutcome(rt, ctx, { testFailuresFixed: 0, testsSpentCr: 85, purchases: { batteryQualification: false, heritageQualification: false } });
    for (const f of [...out.reasons, ...out.recommendations]) expect(DICTIONARIES.en[f.code], f.code).toBeDefined();
  });

  test('18. changing language does not change numerical simulation results', () => {
    const opts = { choices: { mode: 'guided' as const, objective: 'landcover' as const, priorityZone: 'sibu' as const }, pkg: packageById('polar'), station: GROUND_STATIONS[1]!, testsSpentCr: null, purchases: { batteryQualification: false, heritageQualification: false } };
    const d = designOf({ ...BALANCED, solar: 'solar_body' });
    const a = evaluateDesign(d, opts);
    const textEn = a.findings.map((f) => findingText('en', f));
    const textMs = a.findings.map((f) => findingText('ms', f));
    const b = evaluateDesign(d, opts);
    expect(b).toEqual(a);
    expect(textEn).not.toEqual(textMs);
    expect(translate('ms', 'menu.start')).toBe('Mula Misi');
  });
});
