// 08 Testing & readiness lab and the Mission Readiness Review (GO / NO-GO).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TEST_COST_CR, PURCHASE_COST_CR, nonHeritageParts } from '../../simulation/design';
import { getComponent } from '../../simulation/catalog';
import { TEST_IDS, launchApproved, readinessGates, runTest as simulateTest } from '../../simulation/verification';
import type { Gate, TestId } from '../../simulation/types';
import { bridge } from '../../game/bridge';
import { play } from '../../audio/sfx';
import { isCurrent, useStore, useT, verificationCtx } from '../../state/store';
import type { Phase } from '../../state/saveSchema';
import { CButton, Panel, StatusChip } from '../components/Controls';
import { Commander } from '../components/Commander';
import { FindingList, LearnButton, TopBar } from '../components/Shared';

function Stepper({ label, value, min, max, step, onChange, unit }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1">
        <CButton size="sm" variant="ghost" onClick={() => onChange(Math.max(min, value - step))} aria-label={`${label} −`}>
          −
        </CButton>
        <span className="num w-14 text-center">
          {value}
          {unit ? ` ${unit}` : ''}
        </span>
        <CButton size="sm" variant="ghost" onClick={() => onChange(Math.min(max, value + step))} aria-label={`${label} +`}>
          +
        </CButton>
      </span>
    </div>
  );
}

export function TestLabScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const run = useStore((s) => s.runTest);
  const setDitl = useStore((s) => s.setDitl);
  const buy = useStore((s) => s.buy);
  const goPhase = useStore((s) => s.goPhase);
  const [running, setRunning] = useState<TestId | null>(null);
  const [queue, setQueue] = useState<TestId[]>([]);
  const [scene, setScene] = useState('lab');

  // Completes a test exactly once: either when the rig animation reports done, or after a fallback
  // timeout (the Phaser loop pauses in background tabs, which must never leave a test stuck).
  const inFlight = useRef<TestId | null>(null);
  const complete = useCallback(
    (id: TestId) => {
      if (inFlight.current !== id) return;
      inFlight.current = null;
      run(id);
      const r = useStore.getState().progress?.tests[id];
      if (r?.status === 'fail') {
        play('error');
        setScene('labFail');
      } else play(r?.status === 'warning' ? 'beep' : 'success');
      setRunning(null);
    },
    [run],
  );
  useEffect(() => bridge.on('labTestDone', complete), [complete]);
  useEffect(() => {
    if (running || !queue.length) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    start(next!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, queue]);
  const invalid = TEST_IDS.filter((id) => p.tests[id] && !isCurrent(p, id));
  useEffect(() => {
    if (invalid.length) setScene('labInvalid');
  }, [invalid.length]);

  const start = (id: TestId) => {
    const preview = simulateTest(id, verificationCtx(p));
    inFlight.current = id;
    setRunning(id);
    play('whoosh');
    bridge.emit('labTest', { id, status: preview.status });
    setTimeout(() => complete(id), useStore.getState().settings.reducedMotion ? 500 : 3200);
  };

  const bat = getComponent(p.design.parts.battery);
  const needsBatteryQual = !!bat && !bat.ulListed && !p.purchases.batteryQualification;
  const needsHeritage = nonHeritageParts(p.design).some((c) => c.subsystem !== 'battery') && !p.purchases.heritageQualification;
  const pending = TEST_IDS.filter((id) => !p.tests[id] || !isCurrent(p, id));

  const card = (id: TestId) => {
    const r = p.tests[id];
    const current = isCurrent(p, id);
    const status = !r ? null : !current ? 'invalid' : r.status;
    return (
      <div key={id} className={`part-card p-2 ${running === id ? 'attention' : ''}`} style={{ cursor: 'default' }} data-testid={`test-${id}`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-bold">{t(`test.${id}`)}</div>
            <p className="text-[0.72rem] text-muted">{t(`test.${id}.desc`)}</p>
          </div>
          {status === null ? <span className="chip chip-info">{t('common.notRun')}</span> : status === 'invalid' ? <StatusChip status="warning" label={t('common.invalid')} /> : <StatusChip status={status} />}
        </div>
        {r && current && (
          <div className="mt-1">
            <FindingList findings={r.findings} showPass compact />
          </div>
        )}
        {r && !current && <p className="mt-1 text-xs text-amber">▲ {t('lab.invalidated')}</p>}
        <div className="mt-1.5 flex justify-end">
          <CButton size="sm" disabled={!!running} onClick={() => start(id)}>
            {running === id ? '…' : r ? t('lab.rerun', { cr: TEST_COST_CR[id] }) : t('lab.run', { cr: TEST_COST_CR[id] })}
          </CButton>
        </div>
      </div>
    );
  };

  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.testlab" right={<span className="num text-xs text-muted">{t('lab.spent', { cr: p.testsSpentCr })}</span>} />
      <div className="pass-through grid min-h-0 flex-1 gap-2 p-2 md:grid-cols-[340px_1fr_320px]">
        <div className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto">{(['T1', 'T2', 'T3', 'T4'] as TestId[]).map(card)}</div>
        <div className="pass-through flex flex-col justify-between gap-2">
          <div className="max-w-xl self-center">
            <Commander key={scene} scene={scene} compact autoHide />
          </div>
          <div className="panel flex flex-wrap justify-center gap-2 self-center p-2">
            <CButton variant="ghost" size="sm" onClick={() => goPhase('hangar')}>◂ {t('lab.toHangar')}</CButton>
            <CButton variant="ghost" size="sm" onClick={() => goPhase('launchPlan')}>{t('lab.toPlan')}</CButton>
            <CButton variant="ghost" size="sm" onClick={() => goPhase('ground')}>{t('lab.toGround')}</CButton>
            <CButton size="sm" disabled={!!running || !pending.length} onClick={() => setQueue(pending)} data-testid="run-all">
              ▶ {t('lab.runAll')} ({pending.length})
            </CButton>
            <CButton variant="primary" disabled={!!running} onClick={() => goPhase('mrr')} data-testid="to-mrr">
              {t('lab.toMrr')} ▸
            </CButton>
          </div>
        </div>
        <div className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto">
          <Panel title={t('lab.ditl')}>
            <div className="flex flex-col gap-1.5">
              <Stepper label={t('lab.ditl.switches')} value={p.design.ditl.separationSwitches} min={1} max={3} step={1} onChange={(v) => setDitl({ separationSwitches: v as 1 | 2 | 3 })} />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{t('lab.ditl.rbf')}</span>
                <CButton size="sm" variant={p.design.ditl.rbfPin ? 'go' : 'default'} onClick={() => setDitl({ rbfPin: !p.design.ditl.rbfPin })} aria-pressed={p.design.ditl.rbfPin}>
                  {p.design.ditl.rbfPin ? t('common.on') : t('common.off')}
                </CButton>
              </div>
              <Stepper label={t('lab.ditl.deploy')} value={p.design.ditl.deployDelayMin} min={0} max={90} step={5} unit={t('lab.ditl.min')} onChange={(v) => setDitl({ deployDelayMin: v })} />
              <Stepper label={t('lab.ditl.tx')} value={p.design.ditl.txDelayMin} min={0} max={90} step={5} unit={t('lab.ditl.min')} onChange={(v) => setDitl({ txDelayMin: v })} />
              <p className="text-[0.7rem] text-dim">{t('lab.ditl.note')}</p>
              <LearnButton id="ditl" />
            </div>
          </Panel>
          {(needsBatteryQual || needsHeritage) && (
            <Panel title="+">
              <div className="flex flex-col gap-2">
                {needsBatteryQual && <CButton size="sm" onClick={() => buy('batteryQualification')}>{t('lab.buy.battery')}</CButton>}
                {needsHeritage && <CButton size="sm" onClick={() => buy('heritageQualification')}>{t('lab.buy.heritage')}</CButton>}
                <span className="text-[0.7rem] text-dim">{PURCHASE_COST_CR.batteryQualification}/{PURCHASE_COST_CR.heritageQualification} Cr</span>
              </div>
            </Panel>
          )}
          {(['T5', 'T6', 'T7'] as TestId[]).map(card)}
          <LearnButton id="testing" />
        </div>
      </div>
    </div>
  );
}

const STATIONS: { key: string; gates: string[] }[] = [
  { key: 'structures', gates: ['T1', 'T2'] },
  { key: 'power', gates: ['T3'] },
  { key: 'software', gates: ['T4'] },
  { key: 'env', gates: ['T5'] },
  { key: 'comms', gates: ['T6', 'station'] },
  { key: 'safety', gates: ['T7', 'subsystems'] },
  { key: 'programme', gates: ['budget', 'reserve', 'package'] },
];

const FIX_PHASE: Record<string, Phase> = { subsystems: 'hangar', budget: 'hangar', reserve: 'hangar', package: 'launchPlan', station: 'ground', science: 'hangar' };

export function MrrScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const launch = useStore((s) => s.launch);
  const goPhase = useStore((s) => s.goPhase);
  const gates = useMemo(() => readinessGates(verificationCtx(p), p.tests, p.testsSpentCr), [p]);
  const approved = launchApproved(gates);
  const [polled, setPolled] = useState(0);
  const reduced = useStore((s) => s.settings.reducedMotion);
  const byId = new Map(gates.map((g) => [g.id, g]));
  const stationOk = (st: (typeof STATIONS)[number]) => st.gates.every((g) => byId.get(g)?.passed);

  useEffect(() => {
    if (polled === 0 || polled > STATIONS.length) return;
    const st = STATIONS[polled - 1]!;
    play(stationOk(st) ? 'beep' : 'error');
    const id = setTimeout(() => setPolled(polled + 1), reduced ? 60 : 420);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polled]);
  useEffect(() => {
    if (polled === STATIONS.length + 1) play(approved ? 'go' : 'nogo');
  }, [polled, approved]);

  const done = polled > STATIONS.length;
  const gateName = (g: Gate) => (g.id.startsWith('T') ? t(`test.${g.id}`) : t(`mrr.gate.${g.id}`));
  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.mrr" />
      <div className="scroll-thin grid flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-3">
          <Panel title={t('mrr.poll')}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATIONS.map((st, i) => {
                const shown = polled > i;
                const ok = stationOk(st);
                return (
                  <div key={st.key} className={`border p-2 text-center ${shown ? (ok ? 'border-green' : 'border-red alarm') : 'border-line'}`}>
                    <div className="engraved">{t(`mrr.st.${st.key}`)}</div>
                    <div className={`font-pixel text-lg ${shown ? (ok ? 'text-green' : 'text-red') : 'text-dim'}`}>{shown ? (ok ? 'GO' : 'NO-GO') : '· · ·'}</div>
                  </div>
                );
              })}
            </div>
            {polled === 0 && (
              <CButton variant="primary" size="lg" className="mt-3 w-full" onClick={() => setPolled(1)} data-testid="run-poll">
                ▶ {t('mrr.runPoll')}
              </CButton>
            )}
            {done && (
              <div className="mt-4 flex flex-col items-center gap-3">
                <div className={`stamp font-pixel border-4 px-6 py-2 text-4xl ${approved ? 'border-green text-green' : 'border-red text-red'}`} data-testid="mrr-verdict">
                  {approved ? t('mrr.go') : t('mrr.nogo')}
                </div>
                <div className="w-full max-w-lg">
                  <Commander scene={approved ? 'mrrGo' : 'mrrNogo'} compact />
                </div>
                {approved ? (
                  <CButton variant="go" size="xl" onClick={launch} data-testid="approve-launch">
                    🚀 {t('mrr.approve')}
                  </CButton>
                ) : (
                  <CButton variant="danger" onClick={() => goPhase('testlab')}>
                    {t('mrr.fix')}
                  </CButton>
                )}
              </div>
            )}
          </Panel>
          <LearnButton id="mrr" />
        </div>
        <Panel title={t('mrr.title')} className="self-start">
          <ul className="flex flex-col gap-2">
            {gates.map((g) => (
              <li key={g.id} className="border-b border-line pb-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{gateName(g)}</span>
                  <span className="flex items-center gap-1">
                    <span className="engraved">{g.critical ? t('mrr.critical') : t('mrr.advisory')}</span>
                    <StatusChip status={g.passed ? 'pass' : g.critical ? 'fail' : 'warning'} />
                  </span>
                </div>
                {!g.passed && (
                  <div className="mt-1">
                    <FindingList findings={g.findings} compact />
                    <CButton size="sm" variant="ghost" className="mt-1" onClick={() => goPhase(g.id.startsWith('T') ? 'testlab' : (FIX_PHASE[g.id] ?? 'hangar'))}>
                      {t('mrr.fix')} ▸
                    </CButton>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
