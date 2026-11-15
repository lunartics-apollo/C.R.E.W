// Mission operations engine: deterministic, event-driven, pure functions over an immutable runtime.
// The UI asks for the next decision, shows it to the player, then resolves it with the player's choice.
import { linkEfficiency, transferCapacityMB } from './design';
import { MISSION_RAJANG, PARTNER_STATION, RAIN_FADE, STORM_WINDOW, TARGET_AREA_HALF_DEG, objectiveById } from './mission';
import {
  COMPRESSION_QUALITY,
  COMPRESSION_RATIO,
  captureGeometry,
  cloudFraction,
  forecastCloud,
  observationQuality,
  offNadirAt,
  scienceValue,
  unusableReason,
} from './observations';
import { ACCESS_RECORD_LIMIT_DEG, contactsFor, inIntervals } from './orbit';
import {
  CRITICAL_SOC,
  DISCHARGE_EFFICIENCY,
  ECLIPSE_HEATER_W,
  INITIAL_SOC,
  SAFE_ENTER_SOC,
  SAFE_EXIT_SOC,
  batteryCapacityWh,
  captureEnergyWh,
  downlinkExtraPowerW,
  modeLoadW,
  part,
  stepBattery,
  sunlitGenerationW,
} from './power';
import { round } from './rng';
import type {
  AnomalyDecision,
  CaptureDecision,
  ContactWindow,
  Decision,
  DownlinkDecision,
  GroundStation,
  LaunchPackage,
  LogEntry,
  MissionChoices,
  MissionRuntime,
  Observation,
  OrbitScenario,
  SocSample,
  SpacecraftDesign,
  SpacecraftMode,
  TargetPass,
  TransferRecord,
} from './types';

export const OPS_STEP_S = 60;
export const HISTORY_EVERY_S = 600;
export const CAPTURE_LEAD_S = 300;
export const PARTNER_COST_CR = 25;
export const ECLIPSE_WARN_SOC = 0.35;
export const LOADSHED_POINTING_PENALTY = 3;
export const PARTNER_CAL_ERROR_DEG = 0.1;
export const HEALTH_CRITICAL = 20;
const BOTTLENECK_COOLDOWN_S = 1.5 * 86400;
const ECLIPSE_COOLDOWN_S = 86400;

export interface OpsContext {
  readonly design: SpacecraftDesign;
  readonly choices: MissionChoices;
  readonly pkg: LaunchPackage;
  readonly station: GroundStation;
  readonly scenario: OrbitScenario;
  readonly calibrationErrorDeg: number;
  readonly seed: number;
  /** Reserve credits available for operations decisions (e.g. booking a partner pass). */
  readonly reserveCr: number;
}

export function initRuntime(ctx: OpsContext): MissionRuntime {
  const cap = batteryCapacityWh(ctx.design);
  return {
    t: 0,
    batteryWh: cap * INITIAL_SOC,
    mode: 'nominal',
    modeUntil: 0,
    health: 100,
    observations: [],
    handledIds: [],
    log: [{ t: 0, code: 'log.separation', severity: 'info' }],
    history: [{ t: 0, socPct: INITIAL_SOC * 100, storageMB: 0, mode: 'nominal' }],
    transfers: [],
    firstContactDone: false,
    anomaliesTriggered: [],
    anomalyChoices: [],
    safeModeEvents: 0,
    brownouts: 0,
    reserveSpentCr: 0,
    partnerStation: false,
    ended: false,
    decisionsMade: 0,
    capturesAttempted: 0,
    capturesBlocked: {},
    downlinkQueue: [],
    eclipseCheckedUntil: 0,
    cooldowns: {},
    lastCaptureT: -1e9,
    commandedSafe: false,
    autoDownlink: false,
  };
}

// ---------------------------------------------------------------- helpers

export function storageUsedMB(rt: MissionRuntime): number {
  return round(rt.observations.filter((o) => o.status === 'stored').reduce((a, o) => a + o.sizeMB, 0), 3);
}

export function storageCapacityMB(design: SpacecraftDesign): number {
  return part(design, 'storage')?.storageMB ?? 0;
}

export function freeStorageMB(rt: MissionRuntime, design: SpacecraftDesign): number {
  return Math.max(0, storageCapacityMB(design) - storageUsedMB(rt));
}

export function pendingMB(rt: MissionRuntime): number {
  return round(rt.observations.filter((o) => o.status === 'stored').reduce((a, o) => a + (o.sizeMB - o.bytesDownMB), 0), 3);
}

export function socPct(rt: MissionRuntime, design: SpacecraftDesign): number {
  const cap = batteryCapacityWh(design);
  return cap > 0 ? (rt.batteryWh / cap) * 100 : 0;
}

function stationFor(contact: ContactWindow, ctx: OpsContext): GroundStation {
  return contact.stationId === 'partner_miri' ? PARTNER_STATION : ctx.station;
}

function calFor(contact: ContactWindow, ctx: OpsContext): number {
  return contact.stationId === 'partner_miri' ? PARTNER_CAL_ERROR_DEG : ctx.calibrationErrorDeg;
}

export function inStorm(contact: ContactWindow): boolean {
  return contact.stationId !== 'partner_miri' && contact.start >= STORM_WINDOW.startS && contact.start < STORM_WINDOW.endS;
}

export function contactCapacityMB(contact: ContactWindow, ctx: OpsContext, fromT: number, rainFade = 1): number {
  const radio = part(ctx.design, 'radio');
  const eff = linkEfficiency(ctx.design, stationFor(contact, ctx), calFor(contact, ctx), rainFade);
  return transferCapacityMB(radio?.dataRateMbps ?? 0, contact.end - Math.max(fromT, contact.start), eff);
}

export function availableContacts(rt: MissionRuntime, ctx: OpsContext): readonly ContactWindow[] {
  const minT = ctx.design.ditl.txDelayMin * 60;
  return contactsFor(ctx.scenario, rt.partnerStation).filter((c) => c.start >= minT);
}

export function remainingCapacityMB(rt: MissionRuntime, ctx: OpsContext): number {
  return availableContacts(rt, ctx)
    .filter((c) => c.end > rt.t && !rt.handledIds.includes(`dl-${c.id}`))
    .reduce((a, c) => a + contactCapacityMB(c, ctx, rt.t, inStorm(c) ? RAIN_FADE[part(ctx.design, 'radio')?.band ?? 'UHF'] : 1), 0);
}

/** Max off-nadir angle to a zone centre that still puts part of the zone in the image (deg). */
export function captureReachDeg(design: SpacecraftDesign): number {
  const cam = part(design, 'payload');
  const adcs = part(design, 'adcs');
  if (!cam || !adcs) return 0;
  return (adcs.maxOffNadirDeg ?? 0) + (cam.fovHalfDeg ?? 0) + TARGET_AREA_HALF_DEG;
}

/** Target passes this spacecraft can actually reach (ADCS off-nadir reach + camera half field of view). */
export function accessiblePasses(ctx: OpsContext): readonly TargetPass[] {
  const cam = part(ctx.design, 'payload');
  const adcs = part(ctx.design, 'adcs');
  if (!cam || !adcs) return [];
  const reach = captureReachDeg(ctx.design);
  return ctx.scenario.targetPasses.filter((p) => p.minOffNadirDeg <= reach);
}

function addLog(log: readonly LogEntry[], entry: LogEntry): LogEntry[] {
  return [...log, entry];
}

// ---------------------------------------------------------------- time integration

interface AdvanceOptions {
  readonly extraW?: number;
  readonly extraUntil?: number;
}

/** Integrates power, battery, automatic safe mode and health from rt.t to tTarget. */
export function advanceTo(rt: MissionRuntime, ctx: OpsContext, tTarget: number, opts: AdvanceOptions = {}): MissionRuntime {
  if (tTarget <= rt.t) return rt;
  const cap = batteryCapacityWh(ctx.design);
  const fullGen = sunlitGenerationW(ctx.design);
  const deployT = ctx.design.ditl.deployDelayMin * 60;
  const wingsDeployable = part(ctx.design, 'solar')?.deployable ?? false;
  let t = rt.t;
  let e = rt.batteryWh;
  let mode: SpacecraftMode = rt.mode;
  let modeUntil = rt.modeUntil;
  let commandedSafe = rt.commandedSafe;
  let health = rt.health;
  let safeModeEvents = rt.safeModeEvents;
  let brownouts = rt.brownouts;
  let log: LogEntry[] = [...rt.log];
  const history: SocSample[] = [...rt.history];
  let lastSample = history.length ? history[history.length - 1]!.t : 0;
  const storage = storageUsedMB(rt);

  while (t < tTarget) {
    const dt = Math.min(OPS_STEP_S, tTarget - t);
    const sun = !inIntervals(ctx.scenario.eclipses, t);
    // Folded wings expose only a fraction of their cells until the deploy timer fires.
    const gen = sun ? (wingsDeployable && t < deployT ? fullGen * 0.3 : fullGen) : 0;
    if (mode === 'loadshed' && t >= modeUntil) {
      mode = 'nominal';
      log = addLog(log, { t, code: 'log.loadshedEnd', severity: 'info' });
    }
    let load = modeLoadW(ctx.design, mode) + (sun ? 0 : ECLIPSE_HEATER_W);
    if (opts.extraW && opts.extraUntil !== undefined && t < opts.extraUntil) load += opts.extraW;
    const before = e;
    e = cap > 0 ? stepBattery(e, cap, gen, load, dt) : 0;
    const soc = cap > 0 ? e / cap : 0;
    if (mode !== 'safe' && soc < SAFE_ENTER_SOC) {
      mode = 'safe';
      safeModeEvents++;
      log = addLog(log, { t, code: 'log.safeAuto', params: { soc: round(soc * 100, 0) }, severity: 'bad' });
    } else if (mode === 'safe' && soc > SAFE_EXIT_SOC && (!commandedSafe || t >= modeUntil)) {
      mode = 'nominal';
      commandedSafe = false;
      log = addLog(log, { t, code: 'log.safeExit', params: { soc: round(soc * 100, 0) }, severity: 'good' });
    }
    if (soc < CRITICAL_SOC) health = Math.max(0, health - 0.05 * (dt / 60));
    if (before > 0 && e <= 0) {
      brownouts++;
      health = Math.max(0, health - 8);
      log = addLog(log, { t, code: 'log.brownout', severity: 'bad' });
    }
    t += dt;
    if (t - lastSample >= HISTORY_EVERY_S || t >= tTarget) {
      history.push({ t, socPct: round(soc * 100, 1), storageMB: storage, mode });
      lastSample = t;
    }
  }
  return { ...rt, t, batteryWh: e, mode, modeUntil, commandedSafe, health: round(health, 2), safeModeEvents, brownouts, log, history };
}

// ---------------------------------------------------------------- decisions

type Candidate =
  | { readonly t: number; readonly kind: 'firstContact'; readonly contact: ContactWindow }
  | { readonly t: number; readonly kind: 'capture'; readonly pass: TargetPass }
  | { readonly t: number; readonly kind: 'contact'; readonly contact: ContactWindow };

function candidates(rt: MissionRuntime, ctx: OpsContext): Candidate[] {
  const out: Candidate[] = [];
  const contacts = availableContacts(rt, ctx);
  if (!rt.firstContactDone) {
    const first = contacts.find((c) => c.stationId !== 'partner_miri' && c.end > rt.t);
    if (first) out.push({ t: Math.max(rt.t, first.start), kind: 'firstContact', contact: first });
    return out;
  }
  for (const p of accessiblePasses(ctx)) {
    if (p.tca < rt.t || rt.handledIds.includes(`cap-${p.id}`)) continue;
    out.push({ t: Math.max(rt.t, p.tca - CAPTURE_LEAD_S), kind: 'capture', pass: p });
  }
  for (const c of contacts) {
    if (c.end <= rt.t || rt.handledIds.includes(`dl-${c.id}`)) continue;
    out.push({ t: Math.max(rt.t, c.start), kind: 'contact', contact: c });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Earliest moment in this pass when the spacecraft can image the target: after finishing the previous image
 * and slewing, while the required off-nadir angle is still within ADCS reach + camera half field of view.
 */
export function captureSlot(rt: MissionRuntime, ctx: OpsContext, pass: TargetPass): { t: number; offNadirDeg: number } | null {
  const cam = part(ctx.design, 'payload');
  const adcs = part(ctx.design, 'adcs');
  if (!cam || !adcs) return null;
  const reach = captureReachDeg(ctx.design);
  const ready = rt.lastCaptureT + (cam.captureSeconds ?? 0) + (adcs.slewSeconds ?? 0);
  const t = Math.max(pass.tca, ready, rt.t);
  if (t > pass.end) return null;
  const eta = offNadirAt(pass, t, ACCESS_RECORD_LIMIT_DEG);
  if (eta > reach) return null;
  return { t, offNadirDeg: round(eta, 1) };
}

export function captureBlockedReason(rt: MissionRuntime, ctx: OpsContext, pass: TargetPass): string | null {
  const cam = part(ctx.design, 'payload');
  const adcs = part(ctx.design, 'adcs');
  if (!cam || !adcs) return 'noPayload';
  if (rt.mode === 'safe') return 'safe';
  if (freeStorageMB(rt, ctx.design) < (cam.imageSizeMB ?? 0)) return 'storage';
  if (!captureSlot(rt, ctx, pass)) return 'busy';
  return null;
}

function captureDecision(rt: MissionRuntime, ctx: OpsContext, pass: TargetPass): CaptureDecision {
  const cam = part(ctx.design, 'payload')!;
  const adcs = part(ctx.design, 'adcs')!;
  const slot = captureSlot(rt, ctx, pass);
  const geo = captureGeometry(cam, adcs, slot?.offNadirDeg ?? pass.minOffNadirDeg, ctx.pkg.altitudeKm, rt.mode === 'loadshed' ? LOADSHED_POINTING_PENALTY : 1);
  return {
    kind: 'capture',
    id: `cap-${pass.id}`,
    t: rt.t,
    pass,
    forecastCloud: forecastCloud(pass, ctx.seed),
    energyWh: round(captureEnergyWh(ctx.design), 3),
    sizeMB: cam.imageSizeMB ?? 0,
    predictedCoverage: geo.coverage,
    predictedGsdM: geo.gsdM,
    blockedReason: captureBlockedReason(rt, ctx, pass),
  };
}

function downlinkDecision(rt: MissionRuntime, ctx: OpsContext, contact: ContactWindow, rainFade: number): DownlinkDecision {
  const st = stationFor(contact, ctx);
  const eff = linkEfficiency(ctx.design, st, calFor(contact, ctx), rainFade);
  let blockedReason: string | null = null;
  if (rt.mode === 'safe') blockedReason = 'safe';
  else if (eff <= 0) blockedReason = 'noBand';
  return {
    kind: 'downlink',
    id: `dl-${contact.id}`,
    t: rt.t,
    contact,
    predictedMB: round(contactCapacityMB(contact, ctx, rt.t, rainFade), 2),
    linkEfficiency: round(eff, 3),
    rainFade,
    blockedReason,
  };
}

function eclipseDecision(rt: MissionRuntime, ctx: OpsContext, eclEnd: number): AnomalyDecision | null {
  if (rt.mode !== 'nominal') return null;
  const last = rt.cooldowns['eclipseDeficit'] ?? -1e9;
  if (rt.t - last < ECLIPSE_COOLDOWN_S) return null;
  if (rt.anomaliesTriggered.filter((a) => a === 'eclipseDeficit').length >= 3) return null;
  const cap = batteryCapacityWh(ctx.design);
  if (cap <= 0) return null;
  const dur = (eclEnd - rt.t) / 3600;
  // Planned night-time downlinks inside this eclipse also draw from the battery.
  const nightTxH = pendingMB(rt) > 0
    ? availableContacts(rt, ctx)
        .filter((c) => c.end > rt.t && c.start < eclEnd && !rt.handledIds.includes(`dl-${c.id}`))
        .reduce((a, c) => a + (Math.min(eclEnd, c.end) - Math.max(rt.t, c.start)) / 3600, 0)
    : 0;
  const txWh = downlinkExtraPowerW(ctx.design) * nightTxH;
  const endNominal = (rt.batteryWh - ((modeLoadW(ctx.design, 'nominal') + ECLIPSE_HEATER_W) * dur + txWh) / DISCHARGE_EFFICIENCY) / cap;
  if (endNominal >= ECLIPSE_WARN_SOC) return null;
  const endShed = (rt.batteryWh - ((modeLoadW(ctx.design, 'loadshed') + ECLIPSE_HEATER_W) * dur) / DISCHARGE_EFFICIENCY) / cap;
  return {
    kind: 'eclipseDeficit',
    id: `ecl-${rt.t}`,
    t: rt.t,
    params: {
      socNow: round((rt.batteryWh / cap) * 100, 0),
      socNominal: round(Math.max(0, endNominal) * 100, 0),
      socShed: round(Math.max(0, endShed) * 100, 0),
      eclipseMin: round(dur * 60, 0),
    },
    options: ['stayNominal', 'shedLoad', 'safeMode'],
  };
}

function bottleneckDecision(rt: MissionRuntime, ctx: OpsContext): AnomalyDecision | null {
  const pend = pendingMB(rt);
  if (pend <= 0) return null;
  const last = rt.cooldowns['downlinkBottleneck'] ?? -1e9;
  if (rt.t - last < BOTTLENECK_COOLDOWN_S) return null;
  if (rt.anomaliesTriggered.filter((a) => a === 'downlinkBottleneck').length >= 2) return null;
  const remaining = remainingCapacityMB(rt, ctx);
  if (pend <= remaining) return null;
  const options = ['prioritize'];
  if (part(ctx.design, 'obc')?.compression && rt.observations.some((o) => o.status === 'stored' && !o.compressed)) options.push('compress');
  if (!rt.partnerStation && ctx.reserveCr - rt.reserveSpentCr >= PARTNER_COST_CR && (part(ctx.design, 'radio')?.band ?? 'UHF') !== 'UHF') options.push('bookPartner');
  options.push('continue');
  return {
    kind: 'downlinkBottleneck',
    id: `bn-${rt.t}`,
    t: rt.t,
    params: { pendingMB: round(pend, 1), remainingMB: round(remaining, 1), cost: PARTNER_COST_CR },
    options,
  };
}

export interface NextResult {
  readonly rt: MissionRuntime;
  readonly decision: Decision;
}

/**
 * Advance the mission until something needs the player's attention.
 * Telemetry-only passes (nothing to send) and unreachable passes are handled automatically and logged.
 */
export function nextDecision(rtIn: MissionRuntime, ctx: OpsContext): NextResult {
  let rt = rtIn;
  const end = ctx.scenario.durationS;
  for (let guard = 0; guard < 5000; guard++) {
    if (rt.ended || rt.t >= end) return { rt, decision: { kind: 'end', id: 'end', t: rt.t } };
    if (rt.firstContactDone) {
      const bn = bottleneckDecision(rt, ctx);
      if (bn) return { rt, decision: bn };
    }
    const cands = candidates(rt, ctx);
    const next = cands[0];
    const tNext = next ? Math.min(next.t, end) : end;

    // Check the next eclipse entry before the next scheduled event (energy-deficit anomaly).
    const ecl = ctx.scenario.eclipses.find((e) => e.start > rt.eclipseCheckedUntil && e.start >= rt.t && e.start <= tNext);
    if (ecl && rt.firstContactDone) {
      rt = { ...advanceTo(rt, ctx, ecl.start), eclipseCheckedUntil: ecl.start };
      const d = eclipseDecision(rt, ctx, ecl.end);
      if (d) return { rt, decision: d };
      continue;
    }
    if (!next || next.t >= end) {
      rt = advanceTo(rt, ctx, end);
      continue;
    }
    rt = advanceTo(rt, ctx, next.t);
    if (next.kind === 'firstContact') return { rt, decision: { kind: 'firstContact', id: 'fc', t: rt.t, contact: next.contact } };
    if (next.kind === 'capture') {
      const d = captureDecision(rt, ctx, next.pass);
      if (d.blockedReason === 'busy') {
        rt = { ...rt, handledIds: [...rt.handledIds, d.id], capturesBlocked: bump(rt.capturesBlocked, 'busy') };
        continue;
      }
      return { rt, decision: d };
    }
    // Contact
    const c = next.contact;
    const band = part(ctx.design, 'radio')?.band ?? 'UHF';
    if (inStorm(c) && !rt.anomaliesTriggered.includes('storm') && pendingMB(rt) > 0) {
      return {
        rt,
        decision: {
          kind: 'storm',
          id: `storm-${c.id}`,
          t: rt.t,
          contact: c,
          params: { band, fade: RAIN_FADE[band], predictedMB: round(contactCapacityMB(c, ctx, rt.t, RAIN_FADE[band]), 1), clearMB: round(contactCapacityMB(c, ctx, rt.t), 1) },
          options: ['useAnyway', 'skipPass'],
        },
      };
    }
    const fade = inStorm(c) ? RAIN_FADE[band] : 1;
    if (pendingMB(rt) <= 0 || rt.autoDownlink) {
      // Telemetry-only pass, or the player enabled automatic downlink of the priority queue.
      rt = pendingMB(rt) > 0 && rt.mode !== 'safe' ? performPass(rt, ctx, c, fade) : markHandled(rt, `dl-${c.id}`);
      continue;
    }
    return { rt, decision: downlinkDecision(rt, ctx, c, fade) };
  }
  return { rt, decision: { kind: 'end', id: 'end', t: rt.t } };
}

function bump(rec: Readonly<Record<string, number>>, key: string): Record<string, number> {
  return { ...rec, [key]: (rec[key] ?? 0) + 1 };
}

function markHandled(rt: MissionRuntime, id: string): MissionRuntime {
  return { ...rt, handledIds: [...rt.handledIds, id] };
}

// ---------------------------------------------------------------- actions

export function performCapture(rtIn: MissionRuntime, ctx: OpsContext, pass: TargetPass): MissionRuntime {
  const cam = part(ctx.design, 'payload');
  const adcs = part(ctx.design, 'adcs');
  let rt = markHandled(rtIn, `cap-${pass.id}`);
  const blocked = captureBlockedReason(rtIn, ctx, pass);
  if (!cam || !adcs || blocked) {
    return { ...rt, capturesBlocked: bump(rt.capturesBlocked, blocked ?? 'noPayload'), log: addLog(rt.log, { t: rt.t, code: 'log.captureBlocked', params: { zone: pass.zoneId, reason: blocked ?? 'noPayload' }, severity: 'warn' }) };
  }
  const slot = captureSlot(rtIn, ctx, pass)!;
  rt = advanceTo(rt, ctx, slot.t);
  const objective = objectiveById(ctx.choices.objective);
  const penalty = rt.mode === 'loadshed' ? LOADSHED_POINTING_PENALTY : 1;
  const geo = captureGeometry(cam, adcs, slot.offNadirDeg, ctx.pkg.altitudeKm, penalty);
  const cloud = cloudFraction(pass, ctx.seed);
  const quality = observationQuality(cloud, geo.coverage, geo.gsdM, objective, false, cam.bands ?? 'RGB');
  const usable = unusableReason({ cloud, coverage: geo.coverage, gsdM: geo.gsdM }, objective, cam) === null;
  const obs: Observation = {
    id: `obs-${rt.observations.length + 1}`,
    passId: pass.id,
    zoneId: pass.zoneId,
    t: slot.t,
    sizeMB: cam.imageSizeMB ?? 0,
    originalSizeMB: cam.imageSizeMB ?? 0,
    cloud,
    forecastCloud: forecastCloud(pass, ctx.seed),
    coverage: geo.coverage,
    gsdM: geo.gsdM,
    offNadirDeg: slot.offNadirDeg,
    compressed: false,
    bytesDownMB: 0,
    status: 'stored',
    quality,
    scienceValue: scienceValue(quality, usable, pass.zoneId, ctx.choices.priorityZone),
  };
  const cap = batteryCapacityWh(ctx.design);
  const energy = captureEnergyWh(ctx.design);
  const batteryWh = Math.max(0, rt.batteryWh - energy / DISCHARGE_EFFICIENCY);
  let next: MissionRuntime = {
    ...rt,
    batteryWh,
    observations: [...rt.observations, obs],
    downlinkQueue: [...rt.downlinkQueue, obs.id],
    capturesAttempted: rt.capturesAttempted + 1,
    lastCaptureT: slot.t,
    log: addLog(rt.log, { t: slot.t, code: 'log.captured', params: { zone: pass.zoneId, cloud: round(cloud * 100, 0), mb: obs.sizeMB, wh: round(energy, 2) }, severity: usable ? 'good' : 'warn' }),
  };
  if (cap > 0 && batteryWh / cap < SAFE_ENTER_SOC && next.mode !== 'safe') {
    next = { ...next, mode: 'safe', safeModeEvents: next.safeModeEvents + 1, log: addLog(next.log, { t: next.t, code: 'log.safeAuto', params: { soc: round((batteryWh / cap) * 100, 0) }, severity: 'bad' }) };
  }
  return advanceTo(next, ctx, slot.t + (cam.captureSeconds ?? 0));
}

/** Runs a full ground-station pass, sending files from the priority queue until the link closes. */
export function performPass(rtIn: MissionRuntime, ctx: OpsContext, contact: ContactWindow, rainFade: number): MissionRuntime {
  let rt = markHandled(rtIn, `dl-${contact.id}`);
  if (rt.mode === 'safe') {
    return advanceTo({ ...rt, log: addLog(rt.log, { t: rt.t, code: 'log.passSafe', severity: 'warn' }) }, ctx, contact.end);
  }
  const radio = part(ctx.design, 'radio');
  const st = stationFor(contact, ctx);
  const eff = linkEfficiency(ctx.design, st, calFor(contact, ctx), rainFade);
  const startT = Math.max(rt.t, contact.start);
  const duration = Math.max(0, contact.end - startT);
  const rate = radio?.dataRateMbps ?? 0;
  const capacity = transferCapacityMB(rate, duration, eff);
  let left = capacity;
  const files: { obsId: string; mb: number; completed: boolean }[] = [];
  const byId = new Map(rt.observations.map((o) => [o.id, o]));
  const order = [...rt.downlinkQueue, ...rt.observations.filter((o) => o.status === 'stored' && !rt.downlinkQueue.includes(o.id)).map((o) => o.id)];
  for (const id of order) {
    const o = byId.get(id);
    if (!o || o.status !== 'stored' || left <= 1e-9) continue;
    const need = o.sizeMB - o.bytesDownMB;
    const send = Math.min(need, left);
    left -= send;
    const done = o.bytesDownMB + send >= o.sizeMB - 1e-6;
    byId.set(id, { ...o, bytesDownMB: round(o.bytesDownMB + send, 4), status: done ? 'downlinked' : 'stored' });
    files.push({ obsId: id, mb: round(send, 3), completed: done });
  }
  const sent = capacity - left;
  const txSeconds = rate > 0 && eff > 0 ? Math.min(duration, (sent * 8) / (rate * eff)) : 0;
  const observations = rt.observations.map((o) => byId.get(o.id) ?? o);
  const record: TransferRecord = { contactId: contact.id, t: startT, durationS: duration, capacityMB: round(capacity, 3), sentMB: round(sent, 3), files };
  rt = {
    ...rt,
    observations,
    downlinkQueue: rt.downlinkQueue.filter((id) => byId.get(id)?.status === 'stored'),
    transfers: [...rt.transfers, record],
    log: addLog(rt.log, { t: startT, code: 'log.pass', params: { station: contact.stationId, mb: round(sent, 1), cap: round(capacity, 1), files: files.filter((f) => f.completed).length }, severity: sent > 0 ? 'good' : 'warn' }),
  };
  return advanceTo(rt, ctx, contact.end, { extraW: downlinkExtraPowerW(ctx.design), extraUntil: startT + txSeconds });
}

export type Choice =
  | 'capture'
  | 'skip'
  | 'send'
  | 'ack'
  | 'stayNominal'
  | 'shedLoad'
  | 'safeMode'
  | 'prioritize'
  | 'compress'
  | 'bookPartner'
  | 'continue'
  | 'useAnyway'
  | 'skipPass'
  | 'end';

/** Apply the player's choice to a decision. Unknown or invalid choices leave the runtime unchanged. */
export function resolveDecision(rtIn: MissionRuntime, ctx: OpsContext, decision: Decision, choice: Choice): MissionRuntime {
  const rt = { ...rtIn, decisionsMade: rtIn.decisionsMade + 1 };
  switch (decision.kind) {
    case 'firstContact':
      return {
        ...markHandled(rt, `dl-${decision.contact.id}`),
        firstContactDone: true,
        log: addLog(rt.log, { t: rt.t, code: 'log.firstContact', params: { soc: round(socPct(rt, ctx.design), 0) }, severity: 'good' }),
      };
    case 'capture':
      if (choice === 'capture') return performCapture(rt, ctx, decision.pass);
      return { ...markHandled(rt, decision.id), log: addLog(rt.log, { t: rt.t, code: 'log.skipped', params: { zone: decision.pass.zoneId, fc: round(decision.forecastCloud * 100, 0) }, severity: 'info' }) };
    case 'downlink':
      if (choice === 'send') return performPass(rt, ctx, decision.contact, decision.rainFade);
      return { ...markHandled(rt, decision.id), log: addLog(rt.log, { t: rt.t, code: 'log.passSkipped', severity: 'info' }) };
    case 'storm': {
      const base = { ...rt, anomaliesTriggered: [...rt.anomaliesTriggered, 'storm'], anomalyChoices: [...rt.anomalyChoices, { kind: 'storm', choice, t: rt.t }] };
      const c = decision.contact!;
      if (choice === 'useAnyway') return performPass(base, ctx, c, Number(decision.params['fade'] ?? 1));
      return { ...markHandled(base, `dl-${c.id}`), log: addLog(base.log, { t: rt.t, code: 'log.stormSkip', severity: 'info' }) };
    }
    case 'eclipseDeficit': {
      const base: MissionRuntime = {
        ...rt,
        cooldowns: { ...rt.cooldowns, eclipseDeficit: rt.t },
        anomaliesTriggered: [...rt.anomaliesTriggered, 'eclipseDeficit'],
        anomalyChoices: [...rt.anomalyChoices, { kind: 'eclipseDeficit', choice, t: rt.t }],
      };
      if (choice === 'shedLoad') return { ...base, mode: 'loadshed', modeUntil: rt.t + ctx.scenario.periodS, log: addLog(base.log, { t: rt.t, code: 'log.loadshed', severity: 'info' }) };
      if (choice === 'safeMode') return { ...base, mode: 'safe', commandedSafe: true, modeUntil: rt.t + ctx.scenario.periodS, log: addLog(base.log, { t: rt.t, code: 'log.safeCommanded', severity: 'info' }) };
      return { ...base, log: addLog(base.log, { t: rt.t, code: 'log.stayNominal', severity: 'warn' }) };
    }
    case 'downlinkBottleneck': {
      const base: MissionRuntime = {
        ...rt,
        cooldowns: { ...rt.cooldowns, downlinkBottleneck: rt.t },
        anomaliesTriggered: [...rt.anomaliesTriggered, 'downlinkBottleneck'],
        anomalyChoices: [...rt.anomalyChoices, { kind: 'downlinkBottleneck', choice, t: rt.t }],
      };
      if (choice === 'prioritize') return prioritizeQueue(base, ctx, true);
      if (choice === 'compress' && decision.options.includes('compress')) return compressAll(base, ctx);
      if (choice === 'bookPartner' && decision.options.includes('bookPartner')) {
        return { ...base, partnerStation: true, reserveSpentCr: base.reserveSpentCr + PARTNER_COST_CR, log: addLog(base.log, { t: rt.t, code: 'log.partner', params: { cost: PARTNER_COST_CR }, severity: 'info' }) };
      }
      return base;
    }
    case 'end':
      return { ...rt, ended: true, log: addLog(rt.log, { t: rt.t, code: 'log.end', severity: 'info' }) };
  }
}

/** Sort queue by science value (usable, priority zone first); optionally delete files that cannot be usable. */
export function prioritizeQueue(rt: MissionRuntime, ctx: OpsContext, deleteUnusable: boolean): MissionRuntime {
  const cam = part(ctx.design, 'payload');
  const objective = objectiveById(ctx.choices.objective);
  let observations = rt.observations;
  let deleted = 0;
  if (deleteUnusable && cam) {
    observations = observations.map((o) => {
      if (o.status !== 'stored') return o;
      // The operator only sees what the onboard quick-look shows: cloud and coverage are visible in thumbnails.
      if (unusableReason(o, objective, cam) !== null) {
        deleted++;
        return { ...o, status: 'deleted' as const };
      }
      return o;
    });
  }
  const stored = observations.filter((o) => o.status === 'stored').sort((a, b) => b.scienceValue - a.scienceValue || a.t - b.t);
  return {
    ...rt,
    observations,
    downlinkQueue: stored.map((o) => o.id),
    log: addLog(rt.log, { t: rt.t, code: 'log.prioritized', params: { deleted }, severity: 'info' }),
  };
}

export function compressAll(rt: MissionRuntime, ctx: OpsContext): MissionRuntime {
  const cam = part(ctx.design, 'payload');
  const objective = objectiveById(ctx.choices.objective);
  if (!part(ctx.design, 'obc')?.compression || !cam) return rt;
  let n = 0;
  const observations = rt.observations.map((o) => {
    if (o.status !== 'stored' || o.compressed) return o;
    n++;
    const remaining = o.sizeMB - o.bytesDownMB;
    const sizeMB = round(o.bytesDownMB + remaining * COMPRESSION_RATIO, 3);
    const quality = round(o.quality * COMPRESSION_QUALITY[cam.bands ?? 'RGB'], 3);
    const usable = unusableReason(o, objective, cam) === null;
    return { ...o, compressed: true, sizeMB, quality, scienceValue: scienceValue(quality, usable, o.zoneId, ctx.choices.priorityZone) };
  });
  return { ...rt, observations, log: addLog(rt.log, { t: rt.t, code: 'log.compressed', params: { n }, severity: 'info' }) };
}

export function deleteObservation(rt: MissionRuntime, id: string): MissionRuntime {
  const observations = rt.observations.map((o) => (o.id === id && o.status === 'stored' ? { ...o, status: 'deleted' as const } : o));
  return { ...rt, observations, downlinkQueue: rt.downlinkQueue.filter((x) => x !== id), log: addLog(rt.log, { t: rt.t, code: 'log.deleted', params: { id }, severity: 'info' }) };
}

export function moveInQueue(rt: MissionRuntime, id: string, delta: -1 | 1): MissionRuntime {
  const q = [...rt.downlinkQueue];
  const i = q.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= q.length) return rt;
  [q[i], q[j]] = [q[j]!, q[i]!];
  return { ...rt, downlinkQueue: q };
}

export function setAutoDownlink(rt: MissionRuntime, on: boolean): MissionRuntime {
  return { ...rt, autoDownlink: on };
}

export function endMissionNow(rt: MissionRuntime): MissionRuntime {
  return { ...rt, ended: true, log: addLog(rt.log, { t: rt.t, code: 'log.endEarly', severity: 'info' }) };
}

/** Convenience used by tests and the "auto-pilot" demo: resolve every decision with a simple policy. */
export function autoPlay(ctx: OpsContext, policy: (d: Decision, rt: MissionRuntime) => Choice): MissionRuntime {
  let rt = initRuntime(ctx);
  for (let i = 0; i < 2000; i++) {
    const { rt: r, decision } = nextDecision(rt, ctx);
    rt = resolveDecision(r, ctx, decision, policy(decision, r));
    if (rt.ended) break;
  }
  return rt;
}

export const MISSION_DURATION_S = MISSION_RAJANG.campaignDays * 86400;
