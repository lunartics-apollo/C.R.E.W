// Versioned save format (pure functions, testable without a browser).
import type { Decision, GroundStation, LaunchPackage, MissionChoices, MissionOutcome, MissionRuntime, PartSelection, Purchases, SpacecraftDesign, TestId, TestResult } from '../simulation/types';
import { emptyDesign } from '../simulation/design';

export const SAVE_VERSION = 1;

export type Phase =
  | 'menu'
  | 'intro'
  | 'transmission'
  | 'briefing'
  | 'hangar'
  | 'launchPlan'
  | 'ground'
  | 'testlab'
  | 'mrr'
  | 'launch'
  | 'ops'
  | 'debrief';

export const PHASE_ORDER: readonly Phase[] = ['intro', 'transmission', 'briefing', 'hangar', 'launchPlan', 'ground', 'testlab', 'mrr', 'launch', 'ops', 'debrief'];

export type Locale = 'en' | 'ms';

export interface Settings {
  readonly locale: Locale;
  readonly sfxVolume: number; // 0..1
  readonly musicVolume: number; // 0..1
  readonly muted: boolean;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly instantText: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'en',
  sfxVolume: 0.6,
  musicVolume: 0.35,
  muted: false,
  reducedMotion: false,
  highContrast: false,
  instantText: false,
};

export interface BuildSlot {
  readonly name: string;
  readonly parts: PartSelection;
}

export interface GameProgress {
  readonly phase: Phase;
  readonly choices: MissionChoices;
  readonly design: SpacecraftDesign;
  readonly undo: readonly SpacecraftDesign[];
  readonly slots: readonly (BuildSlot | null)[];
  readonly pkgId: LaunchPackage['id'] | null;
  readonly stationId: GroundStation['id'] | null;
  readonly calibrationErrorDeg: number | null;
  readonly tests: Partial<Record<TestId, TestResult>>;
  readonly testsSpentCr: number;
  readonly testsEverFailed: readonly TestId[];
  readonly testsFixed: readonly TestId[];
  readonly purchases: Purchases;
  readonly seed: number;
  readonly runtime: MissionRuntime | null;
  readonly pendingDecision: Decision | null;
  readonly outcome: MissionOutcome | null;
  readonly attempt: number;
  readonly startedAt: number;
}

export interface ArchiveEntry {
  readonly at: number;
  readonly attempt: number;
  readonly objective: MissionChoices['objective'];
  readonly mode: MissionChoices['mode'];
  readonly pkgId: string;
  readonly parts: PartSelection;
  readonly kind: MissionOutcome['kind'];
  readonly score: number;
  readonly usable: number;
  readonly testsFailed: number;
  readonly testsFixed: number;
}

export interface QuizRecord {
  readonly pre: Readonly<Record<string, number>> | null;
  readonly post: Readonly<Record<string, number>> | null;
}

export interface LearningRecord {
  readonly objectivesSeen: readonly string[];
  readonly conceptsOpened: readonly string[];
  readonly decisions: number;
  readonly corrections: number;
  readonly quiz: QuizRecord;
}

export interface SaveData {
  readonly version: number;
  readonly settings: Settings;
  readonly progress: GameProgress | null;
  readonly archive: readonly ArchiveEntry[];
  readonly learning: LearningRecord;
  readonly achievements: readonly string[];
}

export const EMPTY_LEARNING: LearningRecord = { objectivesSeen: [], conceptsOpened: [], decisions: 0, corrections: 0, quiz: { pre: null, post: null } };

export function newProgress(choices: MissionChoices, seed = 2027): GameProgress {
  return {
    phase: 'intro',
    choices,
    design: emptyDesign(),
    undo: [],
    slots: [null, null, null],
    pkgId: null,
    stationId: null,
    calibrationErrorDeg: null,
    tests: {},
    testsSpentCr: 0,
    testsEverFailed: [],
    testsFixed: [],
    purchases: { batteryQualification: false, heritageQualification: false },
    seed,
    runtime: null,
    pendingDecision: null,
    outcome: null,
    attempt: 1,
    startedAt: Date.now(),
  };
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, settings: DEFAULT_SETTINGS, progress: null, archive: [], learning: EMPTY_LEARNING, achievements: [] };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validate and upgrade raw saved data. Returns a safe default when the data is corrupt or from the future. */
export function migrate(raw: unknown): SaveData {
  if (!isObj(raw)) return defaultSave();
  const version = typeof raw['version'] === 'number' ? raw['version'] : 0;
  if (version > SAVE_VERSION) return defaultSave();
  const settings = isObj(raw['settings']) ? { ...DEFAULT_SETTINGS, ...(raw['settings'] as Partial<Settings>) } : DEFAULT_SETTINGS;
  const locale: Locale = settings.locale === 'ms' ? 'ms' : 'en';
  const progressRaw = raw['progress'];
  let progress: GameProgress | null = null;
  if (isObj(progressRaw) && isObj(progressRaw['design']) && isObj(progressRaw['choices'])) {
    const base = newProgress(progressRaw['choices'] as unknown as MissionChoices);
    progress = { ...base, ...(progressRaw as unknown as Partial<GameProgress>) } as GameProgress;
  }
  const learning = isObj(raw['learning']) ? { ...EMPTY_LEARNING, ...(raw['learning'] as Partial<LearningRecord>) } : EMPTY_LEARNING;
  return {
    version: SAVE_VERSION,
    settings: { ...settings, locale },
    progress,
    archive: Array.isArray(raw['archive']) ? (raw['archive'] as ArchiveEntry[]) : [],
    learning,
    achievements: Array.isArray(raw['achievements']) ? (raw['achievements'] as unknown[]).filter((a): a is string => typeof a === 'string') : [],
  };
}

export function serialize(data: SaveData): string {
  return JSON.stringify(data);
}

export function deserialize(text: string | null | undefined): SaveData {
  if (!text) return defaultSave();
  try {
    return migrate(JSON.parse(text));
  } catch {
    return defaultSave();
  }
}
