// Mission outcome and game-defined score (NOT official NASA or Space Apps scoring).
// Weights: science 35%, engineering 25%, operations 20%, budget 10%, risk/recovery 10%.
import { budget, evaluateDesign } from './design';
import { MISSION_RAJANG, objectiveById } from './mission';
import { MIN_COVERAGE, unusableReason } from './observations';
import { HEALTH_CRITICAL, accessiblePasses, type OpsContext } from './ops';
import { part } from './power';
import { clamp, round } from './rng';
import type { Finding, MissionOutcome, MissionRuntime, Purchases, ScoreBreakdown } from './types';

export const SCORE_WEIGHTS = { science: 0.35, engineering: 0.25, operations: 0.2, budget: 0.1, recovery: 0.1 } as const;

export interface IterationStats {
  /** Tests that failed at least once and were later passed after a fix. */
  readonly testFailuresFixed: number;
  /** Total money spent on tests (including retests). */
  readonly testsSpentCr: number;
  readonly purchases: Purchases;
}

export function usableReturned(rt: MissionRuntime, ctx: OpsContext) {
  const cam = part(ctx.design, 'payload');
  const objective = objectiveById(ctx.choices.objective);
  if (!cam) return [];
  return rt.observations.filter((o) => o.status === 'downlinked' && unusableReason(o, objective, cam) === null);
}

export function evaluateOutcome(rt: MissionRuntime, ctx: OpsContext, iter: IterationStats): MissionOutcome {
  const objective = objectiveById(ctx.choices.objective);
  const cam = part(ctx.design, 'payload');
  const usable = usableReturned(rt, ctx);
  const zones = new Set(usable.map((o) => o.zoneId));
  const priorityCovered = zones.has(ctx.choices.priorityZone);
  const survived = rt.health >= HEALTH_CRITICAL;
  const enough = usable.length >= objective.requiredUsable && zones.size >= objective.requiredZones;
  const kind = !survived || usable.length === 0 ? 'failure' : enough ? 'success' : 'partial';

  // -------- reasons (what happened) --------
  const reasons: Finding[] = [];
  const recs: Finding[] = [];
  const captured = rt.observations;
  const count = (pred: (o: (typeof captured)[number]) => boolean) => captured.filter(pred).length;
  if (cam) {
    const cloudy = count((o) => o.cloud > objective.maxCloud);
    const pointing = count((o) => o.cloud <= objective.maxCloud && o.coverage < MIN_COVERAGE);
    const resolution = count((o) => o.cloud <= objective.maxCloud && o.coverage >= MIN_COVERAGE && o.gsdM > objective.maxGsdM);
    const notDown = count((o) => o.status === 'stored' && unusableReason(o, objective, cam) === null);
    const deletedGood = count((o) => o.status === 'deleted' && unusableReason(o, objective, cam) === null);
    if (objective.needsNir && cam.bands !== 'RGB+NIR') {
      reasons.push({ code: 'out.noNir', severity: 'fail' });
      recs.push({ code: 'rec.nirCamera', severity: 'warning' });
    }
    if (cloudy) {
      reasons.push({ code: 'out.cloudy', severity: 'warning', params: { n: cloudy, limit: Math.round(objective.maxCloud * 100) } });
      const afternoon = captured.filter((o) => o.cloud > objective.maxCloud).length > captured.length / 2;
      if (afternoon && ctx.pkg.id !== 'polar') recs.push({ code: 'rec.morningOrbit', severity: 'warning' });
      else recs.push({ code: 'rec.forecast', severity: 'warning' });
    }
    if (pointing) {
      reasons.push({ code: 'out.pointing', severity: 'warning', params: { n: pointing } });
      recs.push({ code: 'rec.betterAdcs', severity: 'warning' });
    }
    if (resolution) {
      reasons.push({ code: 'out.resolution', severity: 'warning', params: { n: resolution } });
      recs.push({ code: 'rec.sharperCamera', severity: 'warning' });
    }
    if (notDown) {
      reasons.push({ code: 'out.notDownlinked', severity: 'warning', params: { n: notDown } });
      const band = part(ctx.design, 'radio')?.band;
      recs.push({ code: band === 'UHF' ? 'rec.fasterRadio' : part(ctx.design, 'obc')?.compression ? 'rec.queue' : 'rec.compression', severity: 'warning' });
    }
    if (deletedGood) reasons.push({ code: 'out.deletedGood', severity: 'warning', params: { n: deletedGood } });
  }
  const storageBlocked = rt.capturesBlocked['storage'] ?? 0;
  if (storageBlocked) {
    reasons.push({ code: 'out.storageFull', severity: 'warning', params: { n: storageBlocked } });
    recs.push({ code: 'rec.storage', severity: 'warning' });
  }
  const safeBlocked = rt.capturesBlocked['safe'] ?? 0;
  if (rt.safeModeEvents || safeBlocked) {
    reasons.push({ code: 'out.safeMode', severity: 'warning', params: { n: rt.safeModeEvents, blocked: safeBlocked } });
    recs.push({ code: 'rec.morePower', severity: 'warning' });
  }
  const reachable = accessiblePasses(ctx).length;
  if (reachable < objective.requiredUsable + 1) {
    reasons.push({ code: 'out.fewPasses', severity: 'warning', params: { n: reachable } });
    recs.push({ code: 'rec.agility', severity: 'warning' });
  }
  if (!survived) reasons.push({ code: 'out.lost', severity: 'fail', params: { health: round(rt.health, 0) } });
  if (kind === 'success') reasons.unshift({ code: 'out.success', severity: 'pass', params: { n: usable.length, zones: zones.size } });

  // -------- score --------
  const sci =
    70 * clamp(usable.length / objective.requiredUsable, 0, 1) +
    15 * clamp(zones.size / objective.requiredZones, 0, 1) +
    (priorityCovered ? 15 : 0);
  const report = evaluateDesign(ctx.design, { choices: ctx.choices, pkg: ctx.pkg, station: ctx.station, testsSpentCr: iter.testsSpentCr, purchases: iter.purchases });
  const m = report.metrics;
  const massMargin = clamp((m.massKg.limit! - m.massKg.value) / m.massKg.limit! / 0.1, 0, 1);
  const powerMargin = clamp(m.orbitAverageMarginW / 2, 0, 1);
  const volMargin = clamp((m.volumeU.limit! - m.volumeU.value) / 0.3, 0, 1);
  const eng = 100 * (0.25 * massMargin + 0.3 * powerMargin + 0.15 * volMargin + 0.3 * clamp(rt.health / 100, 0, 1));
  const attempts = Math.max(1, rt.capturesAttempted);
  const usefulCaptureRatio = cam ? captured.filter((o) => unusableReason(o, objective, cam) === null).length / attempts : 0;
  const goodStored = cam ? captured.filter((o) => o.status !== 'deleted' && unusableReason(o, objective, cam) === null).length : 0;
  const returnRatio = goodStored ? usable.length / goodStored : 0;
  const safePenalty = clamp(1 - rt.safeModeEvents * 0.2 - rt.brownouts * 0.3, 0, 1);
  const ops = 100 * (0.4 * usefulCaptureRatio + 0.4 * returnRatio + 0.2 * safePenalty);
  const b = budget(ctx.design, ctx.choices, ctx.pkg, ctx.station, iter.testsSpentCr, iter.purchases, rt.reserveSpentCr);
  const bud = 100 * clamp(b.reserveFraction / 0.2, 0, 1);
  const anomaliesHandled = rt.anomalyChoices.filter((a) => a.choice !== 'continue' && a.choice !== 'stayNominal').length;
  const rec = 100 * clamp(0.5 * clamp(iter.testFailuresFixed / 2, 0, 1) + 0.5 * clamp(anomaliesHandled / Math.max(1, rt.anomaliesTriggered.length), 0, 1), 0, 1);
  const total = SCORE_WEIGHTS.science * sci + SCORE_WEIGHTS.engineering * eng + SCORE_WEIGHTS.operations * ops + SCORE_WEIGHTS.budget * bud + SCORE_WEIGHTS.recovery * rec;
  // A mission that returned no usable science can never get a high score (no reward for invalid configurations).
  const capped = kind === 'failure' ? Math.min(total, 40) : kind === 'partial' ? Math.min(total, 75) : total;
  const score: ScoreBreakdown = {
    science: round(sci, 0),
    engineering: round(eng, 0),
    operations: round(ops, 0),
    budget: round(bud, 0),
    recovery: round(rec, 0),
    total: round(capped, 0),
  };
  return {
    kind,
    usableReturned: usable.length,
    zonesCovered: zones.size,
    priorityZoneCovered: priorityCovered,
    required: objective.requiredUsable,
    requiredZones: objective.requiredZones,
    survived,
    reasons,
    recommendations: dedupe(recs),
    score,
  };
}

function dedupe(list: Finding[]): Finding[] {
  const seen = new Set<string>();
  return list.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));
}

export const CAMPAIGN_DAYS = MISSION_RAJANG.campaignDays;
