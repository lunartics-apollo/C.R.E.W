// Core simulation types. This module (and everything in src/simulation) must not import Phaser or React.

export type Provenance =
  | 'NASA_GUIDE_VERIFIED' // principle documented in NASA CubeSat 101 (2017)
  | 'OTHER_REFERENCE_VERIFIED' // external technical source with title/section in the source register
  | 'EDUCATIONAL_SIMPLIFICATION' // transparent approximation chosen for teaching
  | 'GAME_ASSUMPTION'; // fictional number: not a real component rating, price or availability

export type Subsystem =
  | 'payload'
  | 'adcs'
  | 'solar'
  | 'battery'
  | 'obc'
  | 'storage'
  | 'radio'
  | 'restraint'
  | 'deorbit';

export const SUBSYSTEMS: readonly Subsystem[] = [
  'payload',
  'adcs',
  'solar',
  'battery',
  'obc',
  'storage',
  'radio',
  'restraint',
  'deorbit',
] as const;

/** Subsystems that must be filled before launch. `deorbit` may legitimately be empty. */
export const ESSENTIAL_SUBSYSTEMS: readonly Subsystem[] = [
  'payload',
  'adcs',
  'solar',
  'battery',
  'obc',
  'storage',
  'radio',
  'restraint',
] as const;

export type RadioBand = 'UHF' | 'S' | 'X';
export type Bands = 'RGB' | 'RGB+NIR';

export interface SpacecraftComponent {
  readonly id: string;
  readonly subsystem: Subsystem;
  readonly massKg: number;
  /** Internal volume consumed, in CubeSat units (1U = 10 cm cube). Exterior parts use 0. */
  readonly volumeU: number;
  readonly exterior: boolean;
  readonly deployable: boolean;
  /** Folded protrusion beyond the rail envelope, millimetres (exterior parts only). */
  readonly protrusionMm: number;
  /** Continuous load in nominal mode (W). */
  readonly idlePowerW: number;
  /** Load while actively operating (imaging, slewing, transmitting) (W). */
  readonly activePowerW: number;
  readonly costCr: number;
  readonly flightHeritage: boolean;
  readonly provenance: Provenance;
  // Subsystem-specific performance (optional by subsystem)
  readonly energyWh?: number;
  readonly ulListed?: boolean;
  readonly sunlitGenerationW?: number;
  readonly pointingErrorDeg?: number;
  readonly maxOffNadirDeg?: number;
  readonly slewSeconds?: number;
  readonly gsdAt500kmM?: number;
  readonly fovHalfDeg?: number;
  readonly bands?: Bands;
  readonly imageSizeMB?: number;
  readonly captureSeconds?: number;
  readonly dataRateMbps?: number;
  readonly band?: RadioBand;
  readonly requiredPointingDeg?: number;
  readonly storageMB?: number;
  readonly compression?: boolean;
  readonly burnWires?: 1 | 2;
  readonly lifetimeFactor?: number;
}

export type PartSelection = Record<Subsystem, string | null>;

export interface DitlConfig {
  /** Independent separation switches (each is an independent inhibit). */
  readonly separationSwitches: 1 | 2 | 3;
  /** Remove-Before-Flight pin fitted (ground safety). */
  readonly rbfPin: boolean;
  /** Minutes after separation before deployables are released. */
  readonly deployDelayMin: number;
  /** Minutes after separation before the first RF transmission. */
  readonly txDelayMin: number;
}

export interface SpacecraftDesign {
  readonly chassis: '3U';
  readonly parts: PartSelection;
  readonly ditl: DitlConfig;
}

export type ObjectiveId = 'landcover' | 'detail' | 'vegetation';
export type ZoneId = 'delta' | 'sibu' | 'kapit' | 'belaga';
export type Mode = 'guided' | 'engineer';

export interface ObservationZone {
  readonly id: ZoneId;
  readonly latDeg: number;
  readonly lonDeg: number;
}

export interface ScienceObjective {
  readonly id: ObjectiveId;
  readonly maxGsdM: number;
  readonly maxCloud: number;
  readonly needsNir: boolean;
  readonly requiredUsable: number;
  readonly requiredZones: number;
  readonly provenance: Provenance;
}

export interface MissionDefinition {
  readonly id: 'rajang';
  readonly campaignDays: number;
  readonly zones: readonly ObservationZone[];
  readonly objectives: readonly ScienceObjective[];
  readonly budgetCr: Record<Mode, number>;
  readonly reserveFraction: number;
  readonly travelCr: number;
  readonly opsCrPerDay: number;
  readonly epochIso: string;
  readonly utcOffsetHours: number;
  readonly scenarioSeed: number;
}

export interface MissionChoices {
  readonly mode: Mode;
  readonly objective: ObjectiveId;
  readonly priorityZone: ZoneId;
}

export interface LaunchPackage {
  readonly id: 'station' | 'polar' | 'equatorial';
  readonly altitudeKm: number;
  readonly inclinationDeg: number;
  /** RAAN at epoch; for sun-synchronous packages derived from local time of ascending node. */
  readonly raanDeg: number | null;
  readonly ltanHours: number | null;
  readonly initialArgLatDeg: number;
  readonly deployOffsetHours: number;
  readonly costCr: number;
  readonly maxMassKg: number;
  readonly maxProtrusionMm: number;
  readonly minInhibits: number;
  readonly minDeployDelayMin: number;
  readonly minTxDelayMin: number;
  readonly provenance: Provenance;
}

export interface GroundStation {
  readonly id: 'uhf_club' | 'sband_dish' | 'xband_service' | 'partner_miri';
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly bands: readonly RadioBand[];
  readonly costCr: number;
  readonly minElevationDeg: number;
  /** Half-power (3 dB) beamwidth of the ground antenna for its best band, degrees. */
  readonly beamwidthDeg: number;
  readonly provenance: Provenance;
}

// ---------- Orbit scenario ----------

export interface Interval {
  readonly start: number; // seconds since deployment
  readonly end: number;
}

export interface ContactWindow extends Interval {
  readonly stationId: GroundStation['id'];
  readonly maxElevationDeg: number;
  readonly id: string;
}

export interface TargetPass extends Interval {
  readonly zoneId: ZoneId;
  /** Time of closest approach (minimum off-nadir angle). */
  readonly tca: number;
  readonly minOffNadirDeg: number;
  readonly sunElevationDeg: number;
  readonly localSolarHour: number;
  readonly id: string;
}

export interface OrbitScenario {
  readonly packageId: LaunchPackage['id'];
  readonly durationS: number;
  readonly stepS: number;
  readonly periodS: number;
  readonly eclipses: readonly Interval[];
  readonly contacts: readonly ContactWindow[];
  readonly targetPasses: readonly TargetPass[];
  readonly sunlitFraction: number;
}

// ---------- Engineering report ----------

export type Severity = 'pass' | 'warning' | 'fail';

/** Structured, language-neutral finding: UI formats `code` + `params` with i18n. */
export interface Finding {
  readonly code: string;
  readonly severity: Severity;
  readonly params?: Readonly<Record<string, number | string>>;
  readonly remedy?: string; // remedy code
  readonly sourceId?: string;
}

export interface Metric {
  readonly value: number;
  readonly unit: string;
  readonly limit?: number;
}

export interface DesignMetrics {
  readonly massKg: Metric;
  readonly volumeU: Metric;
  readonly protrusionMm: Metric;
  readonly hardwareCr: number;
  readonly idleLoadW: number;
  readonly sunlitGenerationW: number;
  readonly batteryWh: number;
  readonly orbitAverageMarginW: number;
  readonly eclipseEndSocPct: number;
  readonly imagingOrbitMinSocPct: number;
  readonly storageMB: number;
  readonly imagesStorable: number;
  readonly mbPerPass: number;
  readonly cgOffsetCm: number;
  readonly sciencePreview: number; // 0..1 indicative science potential
}

export interface DesignReport {
  readonly metrics: DesignMetrics;
  readonly findings: readonly Finding[];
  readonly complete: boolean;
}

// ---------- Verification ----------

export type TestId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';

export interface TestResult {
  readonly id: TestId;
  readonly status: Severity;
  readonly findings: readonly Finding[];
  readonly costCr: number;
  /** Hash of the inputs this test verified; a mismatch later means the result is invalidated. */
  readonly inputHash: string;
}

export interface Purchases {
  /** Extra qualification for non-UL battery (NASA §2.4 advice). */
  readonly batteryQualification: boolean;
  /** Extra qualification for components without flight heritage. */
  readonly heritageQualification: boolean;
}

export interface Gate {
  readonly id: string;
  readonly passed: boolean;
  readonly critical: boolean;
  readonly findings: readonly Finding[];
}

// ---------- Operations ----------

export type SpacecraftMode = 'nominal' | 'safe' | 'loadshed';

export type ObservationStatus = 'stored' | 'downlinked' | 'deleted';

export interface Observation {
  readonly id: string;
  readonly passId: string;
  readonly zoneId: ZoneId;
  readonly t: number;
  readonly sizeMB: number;
  readonly originalSizeMB: number;
  readonly cloud: number;
  readonly forecastCloud: number;
  readonly coverage: number;
  readonly gsdM: number;
  readonly offNadirDeg: number;
  readonly compressed: boolean;
  readonly bytesDownMB: number;
  readonly status: ObservationStatus;
  readonly quality: number; // 0..1
  readonly scienceValue: number; // weighted 0..1+
}

export type DecisionKind =
  | 'capture'
  | 'downlink'
  | 'eclipseDeficit'
  | 'downlinkBottleneck'
  | 'storm'
  | 'firstContact'
  | 'end';

export interface DecisionBase {
  readonly kind: DecisionKind;
  readonly t: number;
  readonly id: string;
}

export interface CaptureDecision extends DecisionBase {
  readonly kind: 'capture';
  readonly pass: TargetPass;
  readonly forecastCloud: number;
  readonly energyWh: number;
  readonly sizeMB: number;
  readonly predictedCoverage: number;
  readonly predictedGsdM: number;
  readonly blockedReason: string | null;
}

export interface DownlinkDecision extends DecisionBase {
  readonly kind: 'downlink';
  readonly contact: ContactWindow;
  readonly predictedMB: number;
  readonly linkEfficiency: number;
  readonly rainFade: number;
  readonly blockedReason: string | null;
}

export interface FirstContactDecision extends DecisionBase {
  readonly kind: 'firstContact';
  readonly contact: ContactWindow;
}

export interface AnomalyDecision extends DecisionBase {
  readonly kind: 'eclipseDeficit' | 'downlinkBottleneck' | 'storm';
  readonly params: Readonly<Record<string, number | string>>;
  readonly options: readonly string[];
  readonly contact?: ContactWindow;
}

export interface EndDecision extends DecisionBase {
  readonly kind: 'end';
}

export type Decision = CaptureDecision | DownlinkDecision | FirstContactDecision | AnomalyDecision | EndDecision;

export interface LogEntry {
  readonly t: number;
  readonly code: string;
  readonly params?: Readonly<Record<string, number | string>>;
  readonly severity: 'info' | 'good' | 'warn' | 'bad';
}

export interface SocSample {
  readonly t: number;
  readonly socPct: number;
  readonly storageMB: number;
  readonly mode: SpacecraftMode;
}

export interface TransferRecord {
  readonly contactId: string;
  readonly t: number;
  readonly durationS: number;
  readonly capacityMB: number;
  readonly sentMB: number;
  readonly files: readonly { readonly obsId: string; readonly mb: number; readonly completed: boolean }[];
}

export interface MissionRuntime {
  readonly t: number;
  readonly batteryWh: number;
  readonly mode: SpacecraftMode;
  readonly modeUntil: number; // for temporary load-shed / commanded safe periods
  readonly health: number; // 0..100
  readonly observations: readonly Observation[];
  readonly handledIds: readonly string[]; // decisions already resolved / passes consumed
  readonly log: readonly LogEntry[];
  readonly history: readonly SocSample[];
  readonly transfers: readonly TransferRecord[];
  readonly firstContactDone: boolean;
  readonly anomaliesTriggered: readonly string[];
  readonly anomalyChoices: readonly { readonly kind: string; readonly choice: string; readonly t: number }[];
  readonly safeModeEvents: number;
  readonly brownouts: number;
  readonly reserveSpentCr: number;
  readonly partnerStation: boolean;
  readonly ended: boolean;
  readonly decisionsMade: number;
  readonly capturesAttempted: number;
  readonly capturesBlocked: Readonly<Record<string, number>>; // reason -> count
  readonly downlinkQueue: readonly string[]; // observation ids in priority order
  readonly eclipseCheckedUntil: number;
  readonly cooldowns: Readonly<Record<string, number>>; // anomaly kind -> last trigger time
  readonly lastCaptureT: number;
  readonly commandedSafe: boolean;
  readonly autoDownlink: boolean;
}

export type OutcomeKind = 'success' | 'partial' | 'failure';

export interface ScoreBreakdown {
  readonly science: number; // 0..100 (component score)
  readonly engineering: number;
  readonly operations: number;
  readonly budget: number;
  readonly recovery: number;
  readonly total: number; // weighted
}

export interface MissionOutcome {
  readonly kind: OutcomeKind;
  readonly usableReturned: number;
  readonly zonesCovered: number;
  readonly priorityZoneCovered: boolean;
  readonly required: number;
  readonly requiredZones: number;
  readonly survived: boolean;
  readonly reasons: readonly Finding[];
  readonly recommendations: readonly Finding[];
  readonly score: ScoreBreakdown;
}
