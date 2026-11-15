// 04/05 Engineering Workshop: the CubeSat builder (drag to the canvas or tap Install).
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG, getComponent } from '../../simulation/catalog';
import { PRESET_BUILDS, evaluateDesign, withPart } from '../../simulation/design';
import { packageById, stationById } from '../../simulation/mission';
import type { DesignReport, PartSelection, SpacecraftComponent, Subsystem } from '../../simulation/types';
import { SUBSYSTEMS } from '../../simulation/types';
import { TEST_IDS } from '../../simulation/verification';
import { bridge } from '../../game/bridge';
import { cubesatLayout, onSpacecraft } from '../../game/cubesatLayout';
import { play } from '../../audio/sfx';
import { budgetFor, isCurrent, useStore, useT } from '../../state/store';
import { CButton, Meter, Panel, Stat, StatusChip } from '../components/Controls';
import { Commander } from '../components/Commander';
import { FindingList, LearnButton, TopBar } from '../components/Shared';

const SUB_ICON: Record<Subsystem, string> = { payload: '◉', adcs: '⟲', solar: '▦', battery: '▮', obc: '▣', storage: '▤', radio: '⌁', restraint: '⛓', deorbit: '⛵' };

function useReport(parts?: PartSelection): DesignReport | null {
  const p = useStore((s) => s.progress);
  return useMemo(() => {
    if (!p) return null;
    const design = parts ? { ...p.design, parts } : p.design;
    return evaluateDesign(design, {
      choices: p.choices,
      pkg: p.pkgId ? packageById(p.pkgId) : null,
      station: p.stationId ? stationById(p.stationId) : null,
      testsSpentCr: Object.keys(p.tests).length ? p.testsSpentCr : null,
      purchases: p.purchases,
      calibrationErrorDeg: p.calibrationErrorDeg ?? 0,
    });
  }, [p, parts]);
}

function signed(v: number, digits = 2) {
  const r = Math.round(v * 10 ** digits) / 10 ** digits;
  return `${r > 0 ? '+' : ''}${r}`;
}

function PartCard({ c, installed, selected, onSelect, onDragStart, delta }: { c: SpacecraftComponent; installed: boolean; selected: boolean; onSelect: () => void; onDragStart: (e: React.PointerEvent) => void; delta: (id: string) => DesignReport | null }) {
  const t = useT();
  const install = useStore((s) => s.installPart);
  const [hover, setHover] = useState(false);
  const d = hover && !installed ? delta(c.id) : null;
  const base = useReport();
  return (
    <div
      className="part-card p-2"
      data-installed={installed}
      data-selected={selected}
      onPointerDown={onDragStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      data-testid={`part-${c.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button type="button" className="text-left text-sm font-bold text-ink hover:text-cyan" onClick={onSelect} onPointerDown={(e) => e.stopPropagation()}>
          {t(`part.${c.id}`)}
        </button>
        <span className="num shrink-0 text-xs text-amber">{c.costCr} Cr</span>
      </div>
      <div className="num mt-1 flex flex-wrap gap-x-3 text-[0.7rem] text-muted">
        <span>{c.massKg} kg</span>
        {c.volumeU > 0 && <span>{c.volumeU} U</span>}
        {c.idlePowerW > 0 && <span>{c.idlePowerW} W</span>}
        {c.sunlitGenerationW && <span className="text-yellow">+{c.sunlitGenerationW} W</span>}
        {c.energyWh && <span>{c.energyWh} Wh</span>}
        {c.storageMB && <span>{c.storageMB >= 1024 ? `${c.storageMB / 1024} GB` : `${c.storageMB} MB`}</span>}
        {c.dataRateMbps && <span>{c.dataRateMbps} Mbps</span>}
        {!c.flightHeritage && <span className="text-amber">▲ {t('hangar.noHeritage')}</span>}
      </div>
      {d && base && (
        <div className="num mt-1 text-[0.7rem] text-cyan" aria-live="polite">
          {t('hangar.delta')}: {signed(d.metrics.massKg.value - base.metrics.massKg.value)} kg · {signed(d.metrics.orbitAverageMarginW - base.metrics.orbitAverageMarginW)} W · {signed(d.metrics.volumeU.value - base.metrics.volumeU.value)} U · {signed(d.metrics.hardwareCr - base.metrics.hardwareCr, 0)} Cr
        </div>
      )}
      <div className="mt-1.5 flex justify-end">
        {installed ? (
          <span className="chip chip-info">✔ {t('hangar.installed')}</span>
        ) : (
          <CButton size="sm" sound="none" onPointerDown={(e) => e.stopPropagation()} onClick={() => { play('snap'); install(c.subsystem, c.id); }}>
            {t('common.install')}
          </CButton>
        )}
      </div>
    </div>
  );
}

function Readout({ report }: { report: DesignReport }) {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const b = budgetFor(p);
  const m = report.metrics;
  const tone = (v: number, lim: number, warnFrac = 0.95) => (v > lim ? 'fail' : v > lim * warnFrac ? 'warning' : 'pass');
  return (
    <div className="flex flex-col gap-2">
      <Stat label={t('metric.mass')} value={m.massKg.value.toFixed(2)} unit={`/ ${m.massKg.limit} kg`} tone={tone(m.massKg.value, m.massKg.limit!)} />
      <Meter value={m.massKg.value} max={m.massKg.limit! * 1.15} marker={m.massKg.limit!} color={m.massKg.value > m.massKg.limit! ? 'var(--red)' : 'var(--cyan)'} label={t('metric.mass')} />
      <Stat label={t('metric.volume')} value={m.volumeU.value.toFixed(2)} unit={`/ ${m.volumeU.limit} U`} tone={tone(m.volumeU.value, m.volumeU.limit!, 0.97)} />
      <Meter value={m.volumeU.value} max={m.volumeU.limit! * 1.2} marker={m.volumeU.limit!} color={m.volumeU.value > m.volumeU.limit! ? 'var(--red)' : 'var(--teal)'} label={t('metric.volume')} />
      <Stat label={t('metric.protrusion')} value={m.protrusionMm.value} unit={`/ ${m.protrusionMm.limit} mm`} tone={tone(m.protrusionMm.value, m.protrusionMm.limit!, 0.85)} />
      <hr className="border-line" />
      <Stat label={t('metric.gen')} value={m.sunlitGenerationW} unit="W" />
      <Stat label={t('metric.load')} value={m.idleLoadW} unit="W" />
      <Stat label={t('metric.margin')} value={signed(m.orbitAverageMarginW)} unit="W" tone={m.orbitAverageMarginW < 0 ? 'fail' : m.orbitAverageMarginW < 1 ? 'warning' : 'pass'} />
      <Stat label={t('metric.battery')} value={m.batteryWh} unit="Wh" />
      <Stat label={t('metric.eclipseSoc')} value={Math.round(m.imagingOrbitMinSocPct)} unit="%" tone={m.imagingOrbitMinSocPct < 20 ? 'warning' : 'pass'} />
      <Meter value={m.imagingOrbitMinSocPct} max={100} marker={20} color={m.imagingOrbitMinSocPct < 20 ? 'var(--amber)' : 'var(--green)'} label={t('metric.eclipseSoc')} />
      <hr className="border-line" />
      <Stat label={t('metric.images')} value={m.imagesStorable} />
      <Stat label={t('metric.mbPass')} value={m.mbPerPass} unit="MB" />
      <Stat label={t('metric.cg')} value={m.cgOffsetCm} unit="cm" />
      <Stat label={t('metric.science')} value={`${Math.round(m.sciencePreview * 100)}%`} />
      <Meter value={m.sciencePreview} max={1} color="var(--yellow)" label={t('metric.science')} />
      <hr className="border-line" />
      <Stat label={t('metric.cost')} value={m.hardwareCr} unit="Cr" />
      <Stat label={t('metric.reserve')} value={`${b.reserve} (${Math.round(b.reserveFraction * 100)}%)`} unit="Cr" tone={b.reserve < 0 ? 'fail' : b.reserveFraction < 0.1 ? 'warning' : 'pass'} />
    </div>
  );
}

function CompareBuilds({ onClose }: { onClose: () => void }) {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const loadParts = useStore((s) => s.loadParts);
  const rows: { name: string; parts: PartSelection }[] = [
    { name: t('hangar.current'), parts: p.design.parts },
    ...(['highScience', 'balanced', 'endurance'] as const).map((k) => ({ name: t(`hangar.preset.${k}`), parts: PRESET_BUILDS[k] })),
    ...p.slots.flatMap((s, i) => (s ? [{ name: t('hangar.loadSlot', { n: i + 1 }), parts: s.parts }] : [])),
  ];
  const reports = rows.map((r) =>
    evaluateDesign({ ...p.design, parts: r.parts }, { choices: p.choices, pkg: p.pkgId ? packageById(p.pkgId) : null, station: p.stationId ? stationById(p.stationId) : null, testsSpentCr: null, purchases: p.purchases }),
  );
  return (
    <Panel title={t('hangar.compare')} right={<CButton size="sm" variant="ghost" onClick={onClose}>✕</CButton>} className="rise-in">
      <div className="scroll-thin overflow-x-auto">
        <table className="num w-full text-xs">
          <thead className="text-muted">
            <tr>
              <th className="p-1 text-left"> </th>
              <th className="p-1">{t('metric.mass')}</th>
              <th className="p-1">{t('metric.volume')}</th>
              <th className="p-1">{t('metric.margin')}</th>
              <th className="p-1">{t('metric.images')}</th>
              <th className="p-1">{t('metric.mbPass')}</th>
              <th className="p-1">{t('metric.science')}</th>
              <th className="p-1">{t('metric.cost')}</th>
              <th className="p-1"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const m = reports[i]!.metrics;
              const fails = reports[i]!.findings.filter((f) => f.severity === 'fail').length;
              return (
                <tr key={r.name} className="border-t border-line">
                  <td className="p-1 font-bold text-ink">{r.name} {fails > 0 && <span className="text-red">✖{fails}</span>}</td>
                  <td className="p-1 text-center">{m.massKg.value.toFixed(2)}</td>
                  <td className="p-1 text-center">{m.volumeU.value.toFixed(2)}</td>
                  <td className={`p-1 text-center ${m.orbitAverageMarginW < 0 ? 'text-red' : ''}`}>{m.orbitAverageMarginW.toFixed(2)}</td>
                  <td className="p-1 text-center">{m.imagesStorable}</td>
                  <td className="p-1 text-center">{m.mbPerPass}</td>
                  <td className="p-1 text-center">{Math.round(m.sciencePreview * 100)}%</td>
                  <td className="p-1 text-center">{m.hardwareCr}</td>
                  <td className="p-1">{i > 0 && <CButton size="sm" onClick={() => { loadParts({ ...r.parts }); play('snap'); }}>{t('hangar.loadSlot', { n: '' }).trim()}</CButton>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function HangarScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const exploded = useStore((s) => s.hangarExploded);
  const setExploded = useStore((s) => s.setHangarExploded);
  const install = useStore((s) => s.installPart);
  const undo = useStore((s) => s.undo);
  const saveSlot = useStore((s) => s.saveSlot);
  const loadSlot = useStore((s) => s.loadSlot);
  const goPhase = useStore((s) => s.goPhase);
  const toast = useStore((s) => s.toast);
  const report = useReport();
  const [tab, setTab] = useState<Subsystem>('payload');
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; over: boolean } | null>(null);
  const [scene, setScene] = useState<string>('hangar');
  const [seen, setSeen] = useState<string[]>(['hangar']);
  const [compare, setCompare] = useState(false);
  const [, setTick] = useState(0);
  const startRef = useRef<{ x: number; y: number; id: string } | null>(null);

  // Reactive director lines (each plays once per visit)
  useEffect(() => {
    if (!report) return;
    const codes = report.findings.map((f) => f.code);
    let next: string | null = null;
    if (codes.includes('vol.over')) next = 'hangarFit';
    else if (codes.includes('power.negative')) next = 'hangarPower';
    else if (p.design.parts.payload === 'cam_ms' && p.design.parts.solar !== 'solar_wing4') next = 'hangarTempt';
    else if (report.complete && !report.findings.some((f) => f.severity === 'fail')) next = 'hangarGood';
    if (next && !seen.includes(next)) {
      setScene(next);
      setSeen((s) => [...s, next!]);
      if (next !== 'hangarGood') play('alarm');
    }
  }, [report, p.design.parts, seen]);

  // Keep labels aligned with the canvas on resize
  useEffect(() => {
    const r = () => setTick((x) => x + 1);
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  useEffect(() => bridge.on('slotClick', (sub) => { setTab(sub); play('click'); }), []);

  const delta = (id: string) => {
    const c = getComponent(id);
    if (!c) return null;
    return evaluateDesign(withPart(p.design, c.subsystem, id), {
      choices: p.choices,
      pkg: p.pkgId ? packageById(p.pkgId) : null,
      station: p.stationId ? stationById(p.stationId) : null,
      testsSpentCr: null,
      purchases: p.purchases,
    });
  };

  // Pointer-based drag from card to the Phaser canvas
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const st = startRef.current;
      if (!st) return;
      if (!drag && Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
      const b = bridge.toBase(e.clientX, e.clientY);
      const layout = cubesatLayout(p.design.parts, exploded);
      const over = !!b && onSpacecraft(layout, b.x, b.y);
      const c = getComponent(st.id);
      bridge.hangarHover = over && c ? c.subsystem : null;
      setDrag({ id: st.id, x: e.clientX, y: e.clientY, over });
    };
    const up = () => {
      const st = startRef.current;
      startRef.current = null;
      if (drag?.over && st) {
        const c = getComponent(st.id);
        if (c) {
          install(c.subsystem, c.id);
          play('snap');
        }
      }
      bridge.hangarHover = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [drag, p.design.parts, exploded, install]);

  if (!report) return null;
  const invalidated = TEST_IDS.filter((id) => p.tests[id] && !isCurrent(p, id)).length;
  const sel = getComponent(selected);
  const layout = cubesatLayout(p.design.parts, exploded);
  const hasFails = report.findings.some((f) => f.severity === 'fail');

  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.hangar" />
      <div className="pass-through relative grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 md:grid-cols-[300px_1fr_270px]">
        {/* Catalogue */}
        <Panel title={t('hangar.catalog')} className="scroll-thin flex max-h-full min-h-0 flex-col overflow-y-auto">
          <p className="mb-2 pl-3 text-xs text-muted">{t('hangar.drag')}</p>
          <div className="mb-2 flex flex-wrap gap-1" role="tablist">
            {SUBSYSTEMS.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={tab === s}
                title={t(`sub.${s}`)}
                className={`border px-2 py-1 text-xs ${tab === s ? 'border-cyan text-cyan' : p.design.parts[s] ? 'border-line text-green' : s === 'deorbit' ? 'border-line text-muted' : 'border-amber text-amber'}`}
                onClick={() => { play('click'); setTab(s); }}
              >
                {SUB_ICON[s]} {t(`sub.${s}`).split(' ')[0]}
              </button>
            ))}
          </div>
          <div className="mb-2 pl-1">
            <div className="text-sm font-bold text-cyan">{t(`sub.${tab}`)}</div>
            <p className="text-xs text-muted">{t(`sub.${tab}.p`)}</p>
          </div>
          <div className="flex flex-col gap-2">
            {CATALOG.filter((c) => c.subsystem === tab).map((c) => (
              <PartCard
                key={c.id}
                c={c}
                installed={p.design.parts[c.subsystem] === c.id}
                selected={selected === c.id}
                onSelect={() => setSelected(c.id)}
                onDragStart={(e) => {
                  startRef.current = { x: e.clientX, y: e.clientY, id: c.id };
                }}
                delta={delta}
              />
            ))}
            {(tab === 'deorbit' || p.design.parts[tab]) && (
              <CButton size="sm" variant="ghost" onClick={() => { play('remove'); install(tab, null); }} disabled={!p.design.parts[tab]}>
                {t('common.remove')} {t(`sub.${tab}`)}
              </CButton>
            )}
          </div>
          {sel && (
            <div className="mt-3 border border-line p-2 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-bold text-ink">{t(`part.${sel.id}`)}</span>
                <span className="chip chip-info">{t(`prov.${sel.provenance}`)}</span>
              </div>
              <p className="text-muted">{t(`part.${sel.id}.d`)}</p>
              <p className="mt-1 text-dim">{sel.flightHeritage ? t('hangar.heritage') : t('hangar.noHeritage')} · {sel.activePowerW > 0 ? `${sel.activePowerW} W active` : ''}</p>
            </div>
          )}
        </Panel>

        {/* Centre: canvas shows through. Commander + exploded labels + controls */}
        <div className="pass-through flex min-h-0 flex-col justify-between gap-2">
          <div className="max-w-xl self-center">
            <Commander key={scene} scene={scene} compact autoHide />
          </div>
          {invalidated > 0 && (
            <div className="panel alarm self-center px-3 py-2 text-sm text-amber">
              ▲ {t('hangar.testsInvalid', { n: invalidated })}
            </div>
          )}
          {compare && <CompareBuilds onClose={() => setCompare(false)} />}
          <div className="panel flex flex-wrap items-center justify-center gap-2 self-center p-2">
            <CButton size="sm" onClick={() => setExploded(!exploded)} aria-pressed={exploded}>
              {exploded ? t('hangar.assembled') : t('hangar.exploded')}
            </CButton>
            <CButton size="sm" onClick={undo} disabled={!p.undo.length}>
              ↶ {t('common.undo')}
            </CButton>
            <CButton size="sm" onClick={() => setCompare(!compare)}>
              ⇆ {t('hangar.compare')}
            </CButton>
            {[0, 1, 2].map((i) => (
              <span key={i} className="flex">
                <CButton size="sm" variant="ghost" onClick={() => { saveSlot(i); toast(t('hangar.saveSlot', { n: i + 1 }), 'good'); }}>
                  💾{i + 1}
                </CButton>
                {p.slots[i] && (
                  <CButton size="sm" variant="ghost" onClick={() => loadSlot(i)}>
                    ⤓{i + 1}
                  </CButton>
                )}
              </span>
            ))}
            <LearnButton id="power" />
            <LearnButton id="adcs" />
          </div>
        </div>

        {/* Readout + checks */}
        <div className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto">
          <Panel title={t('hangar.stats')}>
            <Readout report={report} />
          </Panel>
          <Panel title={t('hangar.findings')} right={<StatusChip status={hasFails ? 'fail' : report.findings.length ? 'warning' : 'pass'} />}>
            {report.findings.length ? <FindingList findings={report.findings} compact /> : <p className="text-sm text-green">{t('hangar.allGood')}</p>}
          </Panel>
          {Object.keys(p.tests).length > 0 && (
            <CButton onClick={() => goPhase('testlab')}>{t('hangar.backToTests')}</CButton>
          )}
          <CButton variant="primary" size="lg" disabled={!report.complete} onClick={() => goPhase('launchPlan')} data-testid="to-planning">
            {t('hangar.toPlanning')} ▸
          </CButton>
        </div>
      </div>

      {/* Exploded-view labels pinned to canvas coordinates */}
      {exploded &&
        layout.modules.map((m) => {
          const pt = bridge.toClient(m.x + m.w + 10, m.y + m.h / 2);
          if (!pt) return null;
          return (
            <div key={m.sub} className="pointer-events-none fixed z-[5] max-w-[230px] -translate-y-1/2 truncate text-[0.7rem] font-bold" style={{ left: pt.x, top: pt.y, color: m.empty ? 'var(--amber)' : 'var(--text)', textShadow: '0 1px 2px #000' }}>
              — {t(m.sub === 'bus' ? 'sub.bus' : `sub.${m.sub}`)}
              {m.empty ? ` (${t('common.empty')})` : m.id ? `: ${t(`part.${m.id}`)}` : ''}
            </div>
          );
        })}

      {drag && (
        <div className="drag-ghost part-card p-2 text-sm font-bold" style={{ left: drag.x, top: drag.y, borderColor: drag.over ? 'var(--yellow)' : undefined }}>
          {SUB_ICON[getComponent(drag.id)!.subsystem]} {t(`part.${drag.id}`)}
          {drag.over && <div className="text-xs text-yellow">{t('hangar.dropHere')}</div>}
        </div>
      )}
    </div>
  );
}
