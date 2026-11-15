import { PRESET_BUILDS, emptyDesign } from '../../src/simulation/design';
import { GROUND_STATIONS, objectiveById, packageById } from '../../src/simulation/mission';
import { buildScenario } from '../../src/simulation/orbit';
import type { Choice, OpsContext } from '../../src/simulation/ops';
import type { Decision, LaunchPackage, MissionChoices, PartSelection, SpacecraftDesign } from '../../src/simulation/types';

export const GOOD_DITL = { separationSwitches: 3, rbfPin: true, deployDelayMin: 30, txDelayMin: 45 } as const;

export function designOf(parts: Partial<PartSelection>, ditl: SpacecraftDesign['ditl'] = GOOD_DITL): SpacecraftDesign {
  return { ...emptyDesign(), parts: { ...emptyDesign().parts, ...parts }, ditl: { ...ditl } };
}

export const BALANCED = PRESET_BUILDS.balanced;

export function ctxFor(
  parts: Partial<PartSelection>,
  opts: { pkg?: LaunchPackage['id']; objective?: MissionChoices['objective']; station?: number; seed?: number; cal?: number } = {},
): OpsContext {
  const pkg = packageById(opts.pkg ?? 'polar');
  const design = designOf({ deorbit: pkg.id === 'station' ? null : 'drag_sail', ...parts });
  return {
    design,
    choices: { mode: 'guided', objective: opts.objective ?? 'landcover', priorityZone: 'sibu' },
    pkg,
    station: GROUND_STATIONS[opts.station ?? 1]!,
    scenario: buildScenario(pkg),
    calibrationErrorDeg: opts.cal ?? 0.3,
    seed: opts.seed ?? 2027,
    reserveCr: 100,
  };
}

/** A sensible player policy: capture when the forecast looks clear enough, always downlink. */
export function sensiblePolicy(ctx: OpsContext) {
  const o = objectiveById(ctx.choices.objective);
  return (d: Decision): Choice => {
    switch (d.kind) {
      case 'capture':
        return d.blockedReason ? 'skip' : d.forecastCloud <= o.maxCloud + 0.05 ? 'capture' : 'skip';
      case 'downlink':
        return 'send';
      case 'storm':
        return 'useAnyway';
      case 'eclipseDeficit':
        return 'shedLoad';
      case 'downlinkBottleneck':
        return d.options.includes('compress') ? 'compress' : 'prioritize';
      case 'firstContact':
        return 'ack';
      case 'end':
        return 'end';
    }
  };
}

/** Greedy policy: capture everything possible. */
export function greedyPolicy() {
  return (d: Decision): Choice => {
    switch (d.kind) {
      case 'capture':
        return d.blockedReason ? 'skip' : 'capture';
      case 'downlink':
        return 'send';
      case 'storm':
        return 'useAnyway';
      case 'eclipseDeficit':
        return 'stayNominal';
      case 'downlinkBottleneck':
        return 'continue';
      case 'firstContact':
        return 'ack';
      case 'end':
        return 'end';
    }
  };
}
