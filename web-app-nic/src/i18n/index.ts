// Localization runtime. Simulation results are language-neutral codes; only this layer turns them into text.
import type { Finding } from '../simulation/types';
import type { Locale } from '../state/saveSchema';
import { enSim } from './en/sim';
import { enStory } from './en/story';
import { enUi } from './en/ui';
import { msSim } from './ms/sim';
import { msStory } from './ms/story';
import { msUi } from './ms/ui';

export const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: { ...enUi, ...enSim, ...enStory },
  ms: { ...msUi, ...msSim, ...msStory },
};

export type Params = Readonly<Record<string, string | number>>;

function fmtNumber(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 100) / 100);
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const dict = DICTIONARIES[locale];
  const raw = dict[key] ?? DICTIONARIES.en[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = params[name];
    if (v === undefined) return `{${name}}`;
    return typeof v === 'number' ? fmtNumber(v) : String(v);
  });
}

/** Localize parameters that are themselves codes (subsystem ids, zones, part lists, reasons, stations). */
function localizeParams(locale: Locale, params: Params | undefined): Params | undefined {
  if (!params) return params;
  const out: Record<string, string | number> = { ...params };
  if (typeof out['subsystem'] === 'string') out['subsystem'] = translate(locale, `sub.${out['subsystem']}`);
  if (typeof out['zone'] === 'string') out['zone'] = translate(locale, `zone.${out['zone']}`);
  if (typeof out['parts'] === 'string')
    out['parts'] = String(out['parts'])
      .split(',')
      .filter(Boolean)
      .map((p) => translate(locale, `part.${p}`))
      .join(', ');
  if (typeof out['reason'] === 'string') out['reason'] = translate(locale, `block.${out['reason']}`);
  if (typeof out['station'] === 'string') out['station'] = translate(locale, `station.${out['station']}`);
  return out;
}

export function findingText(locale: Locale, f: Pick<Finding, 'code' | 'params'>): string {
  return translate(locale, `f.${f.code}`, localizeParams(locale, f.params));
}

export function remedyText(locale: Locale, remedy: string | undefined): string | null {
  return remedy ? translate(locale, `r.${remedy}`) : null;
}

export function codeText(locale: Locale, code: string, params?: Params): string {
  return translate(locale, code, localizeParams(locale, params));
}
