// Single source of mission truth (Zustand). Phaser scenes read from here and call actions as typed intents.
import { create } from 'zustand';
import { PRESET_BUILDS, TEST_COST_CR, budget, withPart } from '../simulation/design';
import { GROUND_STATIONS, packageById, stationById } from '../simulation/mission';
import {
  type Choice,
  type OpsContext,
  compressAll,
  deleteObservation,
  endMissionNow,
  initRuntime,
  moveInQueue,
  nextDecision,
  prioritizeQueue,
  resolveDecision,
  setAutoDownlink,
} from '../simulation/ops';
import { buildScenario } from '../simulation/orbit';
import { evaluateOutcome } from '../simulation/score';
import type { DitlConfig, MissionChoices, MissionOutcome, PartSelection, Purchases, Subsystem, TestId } from '../simulation/types';
import { type VerificationContext, isTestCurrent, runTest } from '../simulation/verification';
import { translate, type Params } from '../i18n';
import { clearSave, scheduleSave } from './persistence';
import { type GameProgress, type LearningRecord, type Phase, type SaveData, type Settings, DEFAULT_SETTINGS, EMPTY_LEARNING, defaultSave, newProgress } from './saveSchema';

export type ModalKind =
  | { kind: 'settings' }
  | { kind: 'howto' }
  | { kind: 'sources' }
  | { kind: 'credits' }
  | { kind: 'educator' }
  | { kind: 'archive' }
  | { kind: 'quiz'; which: 'pre' | 'post' }
  | { kind: 'learn'; id: string };

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: 'info' | 'good' | 'warn' | 'bad';
}

interface State extends SaveData {
  loaded: boolean;
  modal: ModalKind | null;
  toasts: Toast[];
  hangarExploded: boolean;
  orbitView: 'region' | 'world';
  speed: number;
  /** Visual mission time (s) the map is animating towards / showing. Not persisted. */
  viewT: number;
  animating: boolean;
  /** True while the player is walking around the academy campus (not persisted). */
  hub: boolean;
}

interface Actions {
  hydrate(save: SaveData): void;
  setSettings(p: Partial<Settings>): void;
  openModal(m: ModalKind | null): void;
  toast(text: string, tone?: Toast['tone']): void;
  dismissToast(id: number): void;
  setHub(on: boolean): void;
  startMission(): void;
  startDemo(): void;
  goPhase(p: Phase): void;
  toMenu(): void;
  setChoices(p: Partial<MissionChoices>): void;
  installPart(sub: Subsystem, id: string | null): void;
  undo(): void;
  loadParts(parts: PartSelection): void;
  loadPreset(name: keyof typeof PRESET_BUILDS): void;
  saveSlot(i: number): void;
  loadSlot(i: number): void;
  setDitl(p: Partial<DitlConfig>): void;
  selectPackage(id: 'station' | 'polar' | 'equatorial'): void;
  selectStation(id: 'uhf_club' | 'sband_dish' | 'xband_service'): void;
  setCalibration(err: number | null): void;
  runTest(id: TestId): void;
  buy(kind: keyof Purchases): void;
  launch(): void;
  beginOps(): void;
  advance(): void;
  resolve(choice: Choice): void;
  queueMove(id: string, d: -1 | 1): void;
  queueDelete(id: string): void;
  queueCompress(): void;
  queuePrioritize(): void;
  toggleAuto(on: boolean): void;
  endEarly(): void;
  finishMission(): void;
  redesign(): void;
  flyAgain(newWeather: boolean): void;
  setHangarExploded(on: boolean): void;
  setOrbitView(v: 'region' | 'world'): void;
  setSpeed(s: number): void;
  setViewT(t: number, animating: boolean): void;
  recordQuiz(which: 'pre' | 'post', answers: Record<string, number>): void;
  conceptOpened(id: string): void;
  resetAll(): Promise<void>;
}

export type Store = State & Actions;

const DEFAULT_CHOICES: MissionChoices = { mode: 'guided', objective: 'landcover', priorityZone: 'sibu' };

let toastId = 1;

function persistable(s: State): SaveData {
  return { version: s.version, settings: s.settings, progress: s.progress, archive: s.archive, learning: s.learning, achievements: s.achievements };
}

export function verificationCtx(p: GameProgress): VerificationContext {
  return {
    design: p.design,
    choices: p.choices,
    pkg: p.pkgId ? packageById(p.pkgId) : null,
    station: p.stationId ? stationById(p.stationId) : null,
    purchases: p.purchases,
    calibrationErrorDeg: p.calibrationErrorDeg,
  };
}

export function budgetFor(p: GameProgress) {
  const v = verificationCtx(p);
  const anyTests = Object.keys(p.tests).length > 0;
  return budget(p.design, p.choices, v.pkg, v.station, anyTests ? p.testsSpentCr : null, p.purchases, p.runtime?.reserveSpentCr ?? 0);
}

export function opsCtx(p: GameProgress): OpsContext | null {
  if (!p.pkgId || !p.stationId) return null;
  const pkg = packageById(p.pkgId);
  const b = budgetFor(p);
  return {
    design: p.design,
    choices: p.choices,
    pkg,
    station: stationById(p.stationId),
    scenario: buildScenario(pkg),
    calibrationErrorDeg: p.calibrationErrorDeg ?? 1,
    seed: p.seed,
    // Reserve at launch (budgetFor already subtracts what operations have spent so far).
    reserveCr: Math.max(0, b.reserve + (p.runtime?.reserveSpentCr ?? 0)),
  };
}

function awardAchievements(s: State, ids: string[]): Partial<State> {
  const fresh = ids.filter((a) => !s.achievements.includes(a));
  if (!fresh.length) return {};
  const toasts = [...s.toasts, ...fresh.map((a) => ({ id: toastId++, text: `★ ${translate(s.settings.locale, `ach.${a}`)}`, tone: 'good' as const }))];
  return { achievements: [...s.achievements, ...fresh], toasts };
}

export const useStore = create<Store>()((set, get) => {
  const patchProgress = (fn: (p: GameProgress) => GameProgress) => {
    const p = get().progress;
    if (!p) return;
    set({ progress: fn(p) });
  };

  return {
    ...defaultSave(),
    loaded: false,
    modal: null,
    toasts: [],
    hangarExploded: false,
    orbitView: 'region',
    speed: 1800,
    viewT: 0,
    animating: false,
    hub: false,

    hydrate(save) {
      set({ ...save, loaded: true, viewT: save.progress?.runtime?.t ?? 0 });
    },
    setSettings(p) {
      set({ settings: { ...get().settings, ...p } });
    },
    openModal(m) {
      set({ modal: m });
    },
    toast(text, tone = 'info') {
      set({ toasts: [...get().toasts.slice(-3), { id: toastId++, text, tone }] });
    },
    setHub(on) {
      set({ hub: on });
    },
    dismissToast(id) {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },

    startMission() {
      set({ progress: newProgress(DEFAULT_CHOICES), viewT: 0 });
    },
    startDemo() {
      const base = newProgress(DEFAULT_CHOICES);
      set({
        progress: {
          ...base,
          phase: 'testlab',
          design: { ...base.design, parts: { ...PRESET_BUILDS.balanced, deorbit: 'drag_sail' }, ditl: { separationSwitches: 2, rbfPin: true, deployDelayMin: 30, txDelayMin: 45 } },
          pkgId: 'polar',
          stationId: 'sband_dish',
          calibrationErrorDeg: 0.4,
        },
        viewT: 0,
      });
    },
    goPhase(phase) {
      patchProgress((p) => ({ ...p, phase }));
    },
    toMenu() {
      set({ modal: null });
      const p = get().progress;
      if (p) set({ progress: { ...p } });
      window.dispatchEvent(new CustomEvent('bs:menu'));
    },
    setChoices(c) {
      patchProgress((p) => ({ ...p, choices: { ...p.choices, ...c } }));
    },
    installPart(sub, id) {
      patchProgress((p) => {
        if (p.design.parts[sub] === id) return p;
        return { ...p, undo: [...p.undo.slice(-19), p.design], design: withPart(p.design, sub, id) };
      });
    },
    undo() {
      patchProgress((p) => {
        const prev = p.undo[p.undo.length - 1];
        if (!prev) return p;
        return { ...p, design: prev, undo: p.undo.slice(0, -1) };
      });
    },
    loadParts(parts) {
      patchProgress((p) => ({ ...p, undo: [...p.undo.slice(-19), p.design], design: { ...p.design, parts: { ...parts } } }));
    },
    loadPreset(name) {
      get().loadParts({ ...PRESET_BUILDS[name] });
    },
    saveSlot(i) {
      patchProgress((p) => {
        const slots = [...p.slots];
        slots[i] = { name: `#${i + 1}`, parts: { ...p.design.parts } };
        return { ...p, slots };
      });
    },
    loadSlot(i) {
      const slot = get().progress?.slots[i];
      if (slot) get().loadParts(slot.parts);
    },
    setDitl(d) {
      patchProgress((p) => ({ ...p, design: { ...p.design, ditl: { ...p.design.ditl, ...d } } }));
    },
    selectPackage(id) {
      patchProgress((p) => ({ ...p, pkgId: id }));
    },
    selectStation(id) {
      patchProgress((p) => ({ ...p, stationId: id, calibrationErrorDeg: p.stationId === id ? p.calibrationErrorDeg : null }));
    },
    setCalibration(err) {
      patchProgress((p) => ({ ...p, calibrationErrorDeg: err }));
    },
    runTest(id) {
      const s = get();
      const p = s.progress;
      if (!p) return;
      const result = runTest(id, verificationCtx(p));
      const failedBefore = p.testsEverFailed.includes(id);
      const testsEverFailed = result.status === 'fail' && !failedBefore ? [...p.testsEverFailed, id] : p.testsEverFailed;
      const fixedNow = failedBefore && result.status !== 'fail' && !p.testsFixed.includes(id);
      const learning: LearningRecord = fixedNow ? { ...s.learning, corrections: s.learning.corrections + 1 } : s.learning;
      set({
        progress: {
          ...p,
          tests: { ...p.tests, [id]: result },
          testsSpentCr: p.testsSpentCr + TEST_COST_CR[id],
          testsEverFailed,
          testsFixed: fixedNow ? [...p.testsFixed, id] : p.testsFixed,
        },
        learning,
        ...(fixedNow ? awardAchievements(s, ['systems_thinker']) : {}),
      });
    },
    buy(kind) {
      if (kind !== 'batteryQualification' && kind !== 'heritageQualification') return;
      patchProgress((p) => ({ ...p, purchases: { ...p.purchases, [kind]: true } }));
    },
    launch() {
      patchProgress((p) => ({ ...p, phase: 'launch', runtime: null, pendingDecision: null, outcome: null }));
    },
    beginOps() {
      const p = get().progress;
      if (!p) return;
      const ctx = opsCtx(p);
      if (!ctx) return;
      const runtime = p.runtime ?? initRuntime(ctx);
      set({ progress: { ...p, phase: 'ops', runtime }, viewT: runtime.t });
    },
    advance() {
      const s = get();
      const p = s.progress;
      if (!p?.runtime || p.pendingDecision) return;
      const ctx = opsCtx(p);
      if (!ctx) return;
      const { rt, decision } = nextDecision(p.runtime, ctx);
      set({ progress: { ...p, runtime: rt, pendingDecision: decision } });
    },
    resolve(choice) {
      const s = get();
      const p = s.progress;
      if (!p?.runtime || !p.pendingDecision) return;
      const ctx = opsCtx(p);
      if (!ctx) return;
      const d = p.pendingDecision;
      const runtime = resolveDecision(p.runtime, ctx, d, choice);
      const ach: string[] = [];
      if (d.kind === 'firstContact') ach.push('first_contact');
      if (d.kind === 'storm') ach.push('storm_chaser');
      if (d.kind === 'downlinkBottleneck' && choice !== 'continue') ach.push('data_wrangler');
      set({
        progress: { ...p, runtime, pendingDecision: null },
        learning: { ...s.learning, decisions: s.learning.decisions + 1 },
        ...awardAchievements(s, ach),
      });
      if (d.kind === 'end' || runtime.ended) get().finishMission();
    },
    queueMove(id, dlt) {
      patchProgress((p) => (p.runtime ? { ...p, runtime: moveInQueue(p.runtime, id, dlt) } : p));
    },
    queueDelete(id) {
      patchProgress((p) => (p.runtime ? { ...p, runtime: deleteObservation(p.runtime, id) } : p));
    },
    queueCompress() {
      const p = get().progress;
      const ctx = p && opsCtx(p);
      if (!p?.runtime || !ctx) return;
      set({ progress: { ...p, runtime: compressAll(p.runtime, ctx) } });
    },
    queuePrioritize() {
      const p = get().progress;
      const ctx = p && opsCtx(p);
      if (!p?.runtime || !ctx) return;
      set({ progress: { ...p, runtime: prioritizeQueue(p.runtime, ctx, false) } });
    },
    toggleAuto(on) {
      patchProgress((p) => (p.runtime ? { ...p, runtime: setAutoDownlink(p.runtime, on) } : p));
    },
    endEarly() {
      patchProgress((p) => (p.runtime ? { ...p, runtime: endMissionNow(p.runtime), pendingDecision: null } : p));
      get().finishMission();
    },
    finishMission() {
      const s = get();
      const p = s.progress;
      if (!p?.runtime) return;
      const ctx = opsCtx(p);
      if (!ctx) return;
      const outcome: MissionOutcome = evaluateOutcome(p.runtime, ctx, { testFailuresFixed: p.testsFixed.length, testsSpentCr: p.testsSpentCr, purchases: p.purchases });
      const ach: string[] = [];
      if (outcome.usableReturned >= 3) ach.push('rajang_observer');
      if (p.runtime.safeModeEvents === 0 && outcome.survived) ach.push('power_planner');
      if (outcome.kind === 'success' && outcome.score.total >= 80) ach.push('mission_architect');
      set({
        progress: { ...p, phase: 'debrief', outcome, runtime: { ...p.runtime, ended: true }, pendingDecision: null },
        archive: [
          ...s.archive,
          {
            at: Date.now(),
            attempt: p.attempt,
            objective: p.choices.objective,
            mode: p.choices.mode,
            pkgId: p.pkgId ?? '?',
            parts: p.design.parts,
            kind: outcome.kind,
            score: outcome.score.total,
            usable: outcome.usableReturned,
            testsFailed: p.testsEverFailed.length,
            testsFixed: p.testsFixed.length,
          },
        ].slice(-50),
        learning: { ...s.learning, objectivesSeen: [...new Set([...s.learning.objectivesSeen, p.choices.objective])] },
        ...awardAchievements(s, ach),
      });
    },
    redesign() {
      patchProgress((p) => ({ ...p, phase: 'hangar', runtime: null, pendingDecision: null, outcome: null, attempt: p.attempt + 1 }));
    },
    flyAgain(newWeather) {
      patchProgress((p) => ({ ...p, phase: 'launch', runtime: null, pendingDecision: null, outcome: null, attempt: p.attempt + 1, seed: newWeather ? p.seed + 1 : p.seed }));
    },
    setHangarExploded(on) {
      set({ hangarExploded: on });
    },
    setOrbitView(v) {
      set({ orbitView: v });
    },
    setSpeed(sp) {
      set({ speed: sp });
    },
    setViewT(t, animating) {
      set({ viewT: t, animating });
    },
    recordQuiz(which, answers) {
      const l = get().learning;
      set({ learning: { ...l, quiz: { ...l.quiz, [which]: answers } } });
    },
    conceptOpened(id) {
      const l = get().learning;
      if (!l.conceptsOpened.includes(id)) set({ learning: { ...l, conceptsOpened: [...l.conceptsOpened, id] } });
    },
    async resetAll() {
      await clearSave();
      set({ ...defaultSave(), settings: { ...DEFAULT_SETTINGS, locale: get().settings.locale }, learning: EMPTY_LEARNING, modal: null });
    },
  };
});

// Autosave whenever persisted state changes.
let lastSaved: SaveData | null = null;
useStore.subscribe((s) => {
  if (!s.loaded) return;
  const data = persistable(s);
  if (lastSaved && lastSaved.settings === data.settings && lastSaved.progress === data.progress && lastSaved.archive === data.archive && lastSaved.learning === data.learning && lastSaved.achievements === data.achievements) return;
  lastSaved = data;
  scheduleSave(data);
});

/** The prologue (Premier's call, then the team meeting) plays as scenes; from the briefing on you walk the station. */
export function wantsStation(phase: Phase): boolean {
  return phase !== 'menu' && phase !== 'intro' && phase !== 'transmission' && phase !== 'meeting';
}

// Whenever the chapter changes, send the player back out onto the campus to walk to the next building.
useStore.subscribe((s, prev) => {
  const phase = s.progress?.phase;
  if (phase && wantsStation(phase) && phase !== prev.progress?.phase && !s.hub) useStore.setState({ hub: true });
});

/** Translation hook bound to the current locale. */
export function useT() {
  const locale = useStore((s) => s.settings.locale);
  return (key: string, params?: Params) => translate(locale, key, params);
}

export function isCurrent(p: GameProgress, id: TestId): boolean {
  return isTestCurrent(p.tests[id], verificationCtx(p));
}

export const STATIONS_FOR_PLAYER = GROUND_STATIONS;
