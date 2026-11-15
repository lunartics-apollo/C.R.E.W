// 06 Launch & orbit planning, 07 Ground station setup with Sun-noise antenna calibration.
import { useEffect, useMemo, useRef, useState } from 'react';
import { GROUND_STATIONS, stationById } from '../../simulation/mission';
import { previewAll } from '../../simulation/planning';
import { groundPointingFactor, stationSupportsRadio } from '../../simulation/design';
import { getComponent } from '../../simulation/catalog';
import { keyedRandom } from '../../simulation/rng';
import type { GroundStation } from '../../simulation/types';
import { play } from '../../audio/sfx';
import { useStore, useT } from '../../state/store';
import { CButton, Meter, Panel, Stat, StatusChip, Switch } from '../components/Controls';
import { Commander } from '../components/Commander';
import { LearnButton, TopBar } from '../components/Shared';

export function LaunchPlanScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const selectPackage = useStore((s) => s.selectPackage);
  const goPhase = useStore((s) => s.goPhase);
  const view = useStore((s) => s.orbitView);
  const setView = useStore((s) => s.setOrbitView);
  const previews = useMemo(() => previewAll(p.design, p.choices, p.stationId ? stationById(p.stationId) : null, p.calibrationErrorDeg ?? 0), [p.design, p.choices, p.stationId, p.calibrationErrorDeg]);
  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.launchPlan" right={<Switch label="view" value={view} onChange={setView} options={[{ value: 'region', label: t('ops.view.region') }, { value: 'world', label: t('ops.view.world') }]} />} />
      <div className="pass-through grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[1fr_460px]">
        <div className="pass-through flex flex-col justify-between gap-2">
          <div className="max-w-xl">
            <Commander scene="plan" compact autoHide />
          </div>
          <div className="panel max-w-xl p-2 text-xs text-muted">
            {t('plan.note')} <br />
            <span className="text-dim">{t('plan.illustrative')}</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <LearnButton id="orbit" />
              <LearnButton id="cloud" />
              <LearnButton id="debris" />
            </div>
          </div>
        </div>
        <div className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto">
          <h2 className="panel-title pl-1">{t('plan.title')}</h2>
          {previews.map((pv) => {
            const sel = p.pkgId === pv.pkg.id;
            return (
              <div key={pv.pkg.id} className="part-card p-3" data-installed={sel} style={{ cursor: 'default' }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-ink">{t(`pkg.${pv.pkg.id}`)}</div>
                    <p className="text-xs text-muted">{t(`pkg.${pv.pkg.id}.desc`)}</p>
                  </div>
                  <span className="num text-amber">{pv.pkg.costCr} Cr</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5">
                  <Stat label={t('plan.altitude')} value={pv.pkg.altitudeKm} unit="km" />
                  <Stat label={t('plan.inclination')} value={pv.pkg.inclinationDeg} unit="°" />
                  <Stat label={t('plan.period')} value={pv.periodMin} unit="min" />
                  <Stat label={t('plan.sunlit')} value={pv.sunlitPct} unit="%" />
                  <Stat label={t('plan.passes')} value={`${pv.reachablePasses} (${pv.reachableEvents})`} tone={pv.reachablePasses < 4 ? 'warning' : 'pass'} />
                  <Stat label={t('plan.localTime')} value={pv.reachablePasses ? `${Math.floor(pv.meanLocalHour)}:${String(Math.round((pv.meanLocalHour % 1) * 60)).padStart(2, '0')}` : '—'} />
                  <Stat label={t('plan.cloud')} value={pv.reachablePasses ? pv.expectedCloudPct : '—'} unit="%" tone={pv.expectedCloudPct > 35 ? 'warning' : 'pass'} />
                  <Stat label={t('plan.contacts')} value={pv.contactsPerDay} />
                  <Stat label={t('plan.contactLen')} value={pv.avgContactMin} unit="min" />
                  <Stat label={t('plan.downlink')} value={pv.campaignDownlinkMB} unit="MB" tone={pv.campaignDownlinkMB < 500 ? 'warning' : 'pass'} />
                  <Stat label={t('plan.lifetime')} value={pv.lifetimeYears} unit="yr" tone={pv.lifetimeYears > 5 ? 'fail' : 'pass'} />
                  <Stat label={t('plan.massLimit')} value={`${pv.massKg.toFixed(2)} / ${pv.pkg.maxMassKg}`} unit="kg" tone={pv.massOk ? 'pass' : 'fail'} />
                </div>
                <div className="mt-1 text-xs text-dim">
                  {t('plan.icd')}: {t('plan.icd.rules', { inh: pv.pkg.minInhibits, dep: pv.pkg.minDeployDelayMin, tx: pv.pkg.minTxDelayMin })}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  {!pv.massOk ? <StatusChip status="fail" label={t('plan.massFail')} /> : <span />}
                  <CButton size="sm" variant={sel ? 'go' : 'default'} onClick={() => selectPackage(pv.pkg.id)} aria-pressed={sel} data-testid={`pkg-${pv.pkg.id}`}>
                    {sel ? `✔ ${t('plan.selected')}` : t('plan.select')}
                  </CButton>
                </div>
              </div>
            );
          })}
          <div className="flex gap-2">
            <CButton variant="ghost" onClick={() => goPhase('hangar')}>
              ◂ {t('common.back')}
            </CButton>
            <CButton variant="primary" size="lg" className="flex-1" disabled={!p.pkgId} onClick={() => goPhase('ground')} data-testid="to-ground">
              {t('plan.toGround')} ▸
            </CButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Sun-noise calibration mini-game
function sunNoise(errDeg: number, beam: number): number {
  const sigma = beam / 2.355;
  return 0.18 * Math.exp(-(errDeg * errDeg) / (2 * 6 * 6)) + 0.82 * Math.exp(-(errDeg * errDeg) / (2 * sigma * sigma));
}

function Calibration({ station }: { station: GroundStation }) {
  const t = useT();
  const seed = useStore((s) => s.progress?.seed ?? 1);
  const cal = useStore((s) => s.progress?.calibrationErrorDeg ?? null);
  const setCalibration = useStore((s) => s.setCalibration);
  const bias = useMemo(() => ({ az: (keyedRandom(seed, `${station.id}:az`) - 0.5) * 6, el: (keyedRandom(seed, `${station.id}:el`) - 0.5) * 4 }), [seed, station.id]);
  const [az, setAz] = useState(0);
  const [el, setEl] = useState(0);
  const [hist, setHist] = useState<number[]>([]);
  const err = Math.hypot(bias.az - az, bias.el - el);
  const n = sunNoise(err, station.beamwidthDeg);
  const last = useRef(n);
  useEffect(() => {
    setHist((h) => [...h.slice(-59), n]);
    if (n > last.current + 0.02) play('beep');
    last.current = n;
  }, [n]);
  const nudge = (daz: number, del: number) => {
    setAz((v) => Math.round((v + daz) * 100) / 100);
    setEl((v) => Math.round((v + del) * 100) / 100);
  };
  const lossDb = cal !== null ? -10 * Math.log10(groundPointingFactor(station, cal)) : null;
  return (
    <Panel title={t('gs.cal.title')}>
      <p className="mb-2 text-xs text-muted">{t('gs.cal.help')}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted">{t('gs.cal.signal')}</span>
            <span className="num text-yellow">{(10 * Math.log10(1 + n * 30)).toFixed(1)} dB</span>
          </div>
          <Meter value={n} max={1} color="var(--yellow)" label={t('gs.cal.signal')} />
          <svg viewBox="0 0 120 40" className="mt-2 h-16 w-full border border-line bg-black/40" aria-hidden="true">
            <polyline fill="none" stroke="#ffd86b" strokeWidth="1" points={hist.map((v, i) => `${i * 2},${38 - v * 36}`).join(' ')} />
          </svg>
          <div className="num mt-1 text-xs text-muted">
            {t('gs.cal.az')}: {az.toFixed(2)}° · {t('gs.cal.el')}: {el.toFixed(2)}°
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 self-center" role="group" aria-label="Antenna nudge">
          <span />
          <CButton size="sm" sound="none" onClick={() => nudge(0, 0.5)} aria-label="Elevation up">▲</CButton>
          <span />
          <CButton size="sm" sound="none" onClick={() => nudge(-0.5, 0)} aria-label="Azimuth left">◀</CButton>
          <span className="text-center text-[0.6rem] text-dim">0.5°</span>
          <CButton size="sm" sound="none" onClick={() => nudge(0.5, 0)} aria-label="Azimuth right">▶</CButton>
          <span />
          <CButton size="sm" sound="none" onClick={() => nudge(0, -0.5)} aria-label="Elevation down">▼</CButton>
          <span />
          <CButton size="sm" variant="ghost" sound="none" onClick={() => nudge(-0.05, 0)} aria-label="Fine azimuth left">‹</CButton>
          <span className="text-center text-[0.6rem] text-dim">0.05°</span>
          <CButton size="sm" variant="ghost" sound="none" onClick={() => nudge(0.05, 0)} aria-label="Fine azimuth right">›</CButton>
          <span />
          <CButton size="sm" variant="ghost" sound="none" onClick={() => nudge(0, 0.05)} aria-label="Fine elevation up">˄</CButton>
          <CButton size="sm" variant="ghost" sound="none" onClick={() => nudge(0, -0.05)} aria-label="Fine elevation down">˅</CButton>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CButton variant="primary" onClick={() => { setCalibration(Math.round(err * 100) / 100); play('success'); }} data-testid="cal-lock">
          ⊕ {t('gs.cal.lock')}
        </CButton>
        {cal !== null && lossDb !== null && (
          <span className={`text-sm ${lossDb > 3 ? 'text-red' : 'text-green'}`}>
            {lossDb > 3 ? '✖' : '✔'} {t('gs.cal.result', { err: cal, loss: Math.round(lossDb * 10) / 10 })}
          </span>
        )}
      </div>
    </Panel>
  );
}

export function GroundScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const selectStation = useStore((s) => s.selectStation);
  const goPhase = useStore((s) => s.goPhase);
  const radio = getComponent(p.design.parts.radio);
  const station = p.stationId ? stationById(p.stationId) : null;
  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.ground" />
      <div className="scroll-thin grid flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-3">
          <Commander scene="ground" compact />
          <Panel title={t('gs.title')}>
            <p className="mb-2 text-xs text-muted">{t('gs.note')}</p>
            <p className="mb-2 text-sm">{t('gs.compat', { band: radio?.band ?? '—' })}</p>
            <div className="flex flex-col gap-2">
              {GROUND_STATIONS.map((gs) => {
                const ok = stationSupportsRadio(gs, p.design);
                const sel = p.stationId === gs.id;
                return (
                  <div key={gs.id} className="part-card p-3" data-installed={sel} style={{ cursor: 'default' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold">{t(`gs.${gs.id}`)}</div>
                        <p className="text-xs text-muted">{t(`gs.${gs.id}.desc`)}</p>
                      </div>
                      <span className="num text-amber">{gs.costCr} Cr</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      <span>
                        {t('gs.bands')}: <span className="num">{gs.bands.join(' · ')}</span>
                      </span>
                      <span>
                        {t('gs.beam')}: <span className="num">{gs.beamwidthDeg}°</span>
                      </span>
                      <StatusChip status={ok ? 'pass' : 'fail'} label={ok ? t('gs.compatOk') : t('gs.compatNo')} />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <CButton size="sm" variant={sel ? 'go' : 'default'} onClick={() => selectStation(gs.id as 'uhf_club' | 'sband_dish' | 'xband_service')} data-testid={`gs-${gs.id}`}>
                        {sel ? `✔ ${t('plan.selected')}` : t('gs.select')}
                      </CButton>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2">
              <LearnButton id="downlink" />
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          {station ? <Calibration key={station.id} station={station} /> : <Panel title={t('gs.cal.title')}><p className="text-sm text-muted">{t('gs.cal.needStation')}</p></Panel>}
          <div className="flex gap-2">
            <CButton variant="ghost" onClick={() => goPhase('launchPlan')}>
              ◂ {t('common.back')}
            </CButton>
            <CButton variant="primary" size="lg" className="flex-1" disabled={!station} onClick={() => goPhase('testlab')} data-testid="to-lab">
              {t('gs.toTests')} ▸
            </CButton>
          </div>
        </div>
      </div>
    </div>
  );
}

