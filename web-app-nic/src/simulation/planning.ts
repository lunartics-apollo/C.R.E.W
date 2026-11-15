// Launch/orbit comparison for the planning screen: every number is computed from the same orbit model used in flight.
import { linkEfficiency, totalMassKg, transferCapacityMB } from './design';
import { GROUND_STATIONS, LAUNCH_PACKAGES, objectiveById } from './mission';
import { climatologicalCloud } from './observations';
import { buildScenario } from './orbit';
import { part } from './power';
import { captureReachDeg } from './ops';
import { round } from './rng';
import type { GroundStation, LaunchPackage, MissionChoices, SpacecraftDesign } from './types';
import { orbitalLifetimeYears } from './verification';

export interface PackagePreview {
  readonly pkg: LaunchPackage;
  readonly periodMin: number;
  readonly sunlitPct: number;
  readonly reachablePasses: number;
  readonly reachableEvents: number;
  readonly meanLocalHour: number;
  readonly expectedCloudPct: number;
  readonly expectedClearPasses: number;
  readonly contactsPerDay: number;
  readonly avgContactMin: number;
  readonly campaignDownlinkMB: number;
  readonly lifetimeYears: number;
  readonly massOk: boolean;
  readonly massKg: number;
}

export function previewPackage(pkg: LaunchPackage, design: SpacecraftDesign, choices: MissionChoices, station: GroundStation | null, calErr = 0): PackagePreview {
  const scn = buildScenario(pkg);
  const cam = part(design, 'payload');
  const adcs = part(design, 'adcs');
  const reach = captureReachDeg(design);
  const passes = cam && adcs ? scn.targetPasses.filter((p) => p.minOffNadirDeg <= reach) : [];
  const events = new Set(passes.map((p) => Math.round(p.tca / 900))).size;
  const meanLst = passes.length ? passes.reduce((a, p) => a + p.localSolarHour, 0) / passes.length : 0;
  const obj = objectiveById(choices.objective);
  const expCloud = passes.length ? passes.reduce((a, p) => a + climatologicalCloud(p.localSolarHour), 0) / passes.length : 0;
  const clear = passes.filter((p) => climatologicalCloud(p.localSolarHour) <= obj.maxCloud).length;
  const kuching = scn.contacts.filter((c) => c.stationId !== 'partner_miri');
  const days = scn.durationS / 86400;
  const avgDur = kuching.length ? kuching.reduce((a, c) => a + (c.end - c.start), 0) / kuching.length : 0;
  const st = station ?? GROUND_STATIONS[1]!;
  const eff = linkEfficiency(design, st, calErr);
  const rate = part(design, 'radio')?.dataRateMbps ?? 0;
  const total = kuching.reduce((a, c) => a + transferCapacityMB(rate, c.end - c.start, eff), 0);
  const mass = totalMassKg(design);
  return {
    pkg,
    periodMin: round(scn.periodS / 60, 1),
    sunlitPct: round(scn.sunlitFraction * 100, 0),
    reachablePasses: passes.length,
    reachableEvents: events,
    meanLocalHour: round(meanLst, 1),
    expectedCloudPct: round(expCloud * 100, 0),
    expectedClearPasses: clear,
    contactsPerDay: round(kuching.length / days, 1),
    avgContactMin: round(avgDur / 60, 1),
    campaignDownlinkMB: round(total, 0),
    lifetimeYears: orbitalLifetimeYears(pkg.altitudeKm, part(design, 'deorbit')?.lifetimeFactor ?? 1),
    massOk: mass <= pkg.maxMassKg,
    massKg: mass,
  };
}

export function previewAll(design: SpacecraftDesign, choices: MissionChoices, station: GroundStation | null, calErr = 0): PackagePreview[] {
  return LAUNCH_PACKAGES.map((p) => previewPackage(p, design, choices, station, calErr));
}
