// 09 Launch, 10–13 Operations, 14 Debrief.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getComponent } from '../../simulation/catalog';
import { MISSION_RAJANG, objectiveById, packageById } from '../../simulation/mission';
import { missionClock } from '../../simulation/orbit';
import { freeStorageMB, pendingMB, storageCapacityMB, storageUsedMB } from '../../simulation/ops';
import { unusableReason } from '../../simulation/observations';
import { SCORE_WEIGHTS } from '../../simulation/score';
import type { Choice } from '../../simulation/ops';
import type { AnomalyDecision, Decision, MissionRuntime, Observation } from '../../simulation/types';
import { bridge } from '../../game/bridge';
import { play } from '../../audio/sfx';
import { codeText } from '../../i18n';
import { useStore, useT } from '../../state/store';
import { CButton, Meter, Panel, Stat, StatusChip, Switch } from '../components/Controls';
import { Commander } from '../components/Commander';
import { LearnButton, TopBar, fmtClock } from '../components/Shared';

// ------------------------------------------------------------------ launch
export function LaunchScreen() {
  const t = useT();
  const beginOps = useStore((s) => s.beginOps);
  const [stage, setStage] = useState('countdown');
  const [done, setDone] = useState(false);
  const [count, setCount] = useState(3);
  useEffect(() => {
    const a = bridge.on('launchStage', (s) => {
      setStage(s);
      if (s === 'deploy') play('deploy');
      if (s === 'liftoff') play('whoosh');
    });
    const b = bridge.on('launchDone', () => {
      setDone(true);
      play('chime');
    });
    return () => {
      a();
      b();
    };
  }, []);
  useEffect(() => {
    if (stage !== 'countdown' || count <= 0) return;
    play('beep');
    const id = setTimeout(() => setCount(count - 1), 900);
    return () => clearTimeout(id);
  }, [count, stage]);
  const skip = () => {
    const sc = bridge.game?.scene.getScene('launch') as unknown as { finish?: () => void } | undefined;
    sc?.finish?.();
    setDone(true);
  };
  return (
    <div className="ui-layer pass-through flex flex-col">
      <TopBar phaseKey="phase.launch" />
      <div className="pass-through flex flex-1 flex-col items-center justify-between p-4">
        <div className="max-w-lg">
          <Commander scene="launch" compact autoHide />
        </div>
        <div className="pointer-events-none text-center">
          {stage === 'countdown' && <div className="font-pixel text-6xl text-amber">T-{count}</div>}
          <div className="font-pixel mt-2 text-xl text-cyan" aria-live="assertive" style={{ textShadow: '0 2px 6px #000' }}>
            {t(`launch.stage.${stage}`)}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          {done ? (
            <CButton variant="primary" size="xl" onClick={beginOps} autoFocus data-testid="begin-ops">
              {t('launch.toOps')} ▸
            </CButton>
          ) : (
            <CButton variant="ghost" onClick={skip}>
              ⏭ {t('launch.skip')}
            </CButton>
          )}
          <p className="text-xs text-dim">{t('launch.note')}</p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ helpers
function socAt(rt: MissionRuntime, t: number): number {
  const h = rt.history;
  if (!h.length) return 0;
  let lo = 0;
  let hi = h.length - 1;
  if (t >= h[hi]!.t) return h[hi]!.socPct;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (h[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = h[lo]!;
  const b = h[hi]!;
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return a.socPct + (b.socPct - a.socPct) * Math.max(0, Math.min(1, f));
}

function useClock(t: number) {
  const tr = useT();
  const pkgId = useStore((s) => s.progress?.pkgId);
  if (!pkgId) return '';
  const c = missionClock(packageById(pkgId), t);
  return fmtClock(c.day, c.hh, c.mm, tr('common.day'));
}

/**
 * Spacecraft state as of the animated clock (viewT). The simulation may already have run ahead
 * (e.g. auto-downlink passes), so the HUD reconstructs what was true at the displayed time.
 */
function stateAtView(rt: MissionRuntime, viewT: number) {
  const completedAt = new Map<string, number>();
  const sent = new Map<string, number>();
  for (const tr of rt.transfers) {
    const end = tr.t + tr.durationS;
    if (end > viewT) continue;
    for (const f of tr.files) {
      sent.set(f.obsId, (sent.get(f.obsId) ?? 0) + f.mb);
      if (f.completed) completedAt.set(f.obsId, end);
    }
  }
  const visible = rt.observations.filter((o) => o.t <= viewT);
  const asOf = visible.map((o) => {
    const done = completedAt.has(o.id);
    const status: Observation['status'] = o.status === 'deleted' ? 'deleted' : done ? 'downlinked' : 'stored';
    return { ...o, status, bytesDownMB: Math.min(o.sizeMB, sent.get(o.id) ?? 0) };
  });
  return { observations: asOf, storageMB: asOf.filter((o) => o.status === 'stored').reduce((a, o) => a + o.sizeMB, 0) };
}

const KIND_SCENE: Partial<Record<Decision['kind'], string>> = {
  firstContact: 'opsFc',
  capture: 'opsCapture',
  downlink: 'opsDownlink',
  eclipseDeficit: 'opsEclipse',
  downlinkBottleneck: 'opsBottleneck',
  storm: 'opsStorm',
  end: 'opsEnd',
};

// ------------------------------------------------------------------ Doppler tuning mini-game (first contact)
function DopplerTuner({ onLocked }: { onLocked: () => void }) {
  const t = useT();
  const [tune, setTune] = useState(0);
  const [lock, setLock] = useState(0);
  const [time, setTime] = useState(0);
  const lockedRef = useRef(false);
  useEffect(() => {
    const id = setInterval(() => setTime((x) => x + 0.1), 100);
    return () => clearInterval(id);
  }, []);
  // Doppler shift of a 437 MHz beacon over a pass: approx −11 kHz·τ/√(τ²+0.3), τ from −2 to +2.
  const tau = ((time % 14) / 14) * 4 - 2;
  const shift = (-11 * tau) / Math.sqrt(tau * tau + 0.3);
  const near = Math.abs(shift - tune) < 1.6;
  useEffect(() => {
    if (lockedRef.current) return;
    setLock((l) => {
      const n = Math.max(0, Math.min(100, l + (near ? 4 : -3)));
      if (n >= 100 && !lockedRef.current) {
        lockedRef.current = true;
        play('success');
        onLocked();
      }
      return n;
    });
  }, [time, near, onLocked]);
  const x = (kHz: number) => ((kHz + 14) / 28) * 100;
  return (
    <div className="mt-2 border border-line p-2">
      <div className="mb-1 text-xs text-muted">{t('dec.fc.tune')}</div>
      <div className="relative h-10 overflow-hidden border border-line bg-black/60" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <span key={i} className="absolute top-0 h-full w-px bg-line" style={{ left: `${(i / 14) * 100}%` }} />
        ))}
        <span className="absolute top-0 h-full w-2 -translate-x-1/2" style={{ left: `${x(shift)}%`, background: 'linear-gradient(180deg, #ffd86b, transparent)' }} />
        <span className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-cyan" style={{ left: `${x(tune)}%` }} />
      </div>
      <input type="range" min={-14} max={14} step={0.1} value={tune} onChange={(e) => setTune(Number(e.target.value))} className="mt-1 w-full" aria-label="Receiver tuning (kHz)" />
      <div className="flex items-center justify-between text-xs">
        <span className="num text-muted">437.000 MHz {tune >= 0 ? '+' : ''}{tune.toFixed(1)} kHz</span>
        <span className={lock >= 100 ? 'text-green' : 'text-amber'}>{lock >= 100 ? `✔ ${t('dec.fc.locked')}` : `${t('dec.fc.lock')} ${Math.round(lock)}%`}</span>
      </div>
      <Meter value={lock} max={100} color={lock >= 100 ? 'var(--green)' : 'var(--amber)'} />
    </div>
  );
}

// ------------------------------------------------------------------ decision cards
function AnomalyCard({ d, onChoose }: { d: AnomalyDecision; onChoose: (c: Choice) => void }) {
  const t = useT();
  const prefix = d.kind === 'eclipseDeficit' ? 'dec.ecl' : d.kind === 'downlinkBottleneck' ? 'dec.bn' : 'dec.storm';
  const params = d.params;
  const bodyParams: Record<string, string | number> =
    d.kind === 'eclipseDeficit'
      ? { min: params['eclipseMin']!, now: params['socNow']!, nom: params['socNominal']! }
      : d.kind === 'downlinkBottleneck'
        ? { pending: params['pendingMB']!, remaining: params['remainingMB']! }
        : { band: params['band']!, clear: params['clearMB']!, pred: params['predictedMB']! };
  return (
    <div>
      <h3 className="font-pixel text-red">⚠ {t(`${prefix}.title`)}</h3>
      <p className="mt-1 text-sm">{t(`${prefix}.body`, bodyParams)}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {d.options.map((o) => (
          <button key={o} type="button" className="part-card p-2 text-left" onClick={() => onChoose(o as Choice)} data-testid={`opt-${o}`}>
            <div className="text-sm font-bold text-ink">{t(`${prefix}.${o}`, { cost: params['cost'] ?? 0 })}</div>
            <p className="text-xs text-muted">{t(`${prefix}.${o}.d`, { shed: params['socShed'] ?? 0 })}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function DecisionCard({ d, rt, onChoose }: { d: Decision; rt: MissionRuntime; onChoose: (c: Choice) => void }) {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const obj = objectiveById(p.choices.objective);
  const [tuned, setTuned] = useState(false);
  if (d.kind === 'capture') {
    const lst = d.pass.localSolarHour;
    return (
      <div>
        <h3 className="font-pixel text-amber">◉ {t('dec.capture.title', { zone: t(`zone.${d.pass.zoneId}`) })}</h3>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <Stat label={t('dec.capture.forecast')} value={Math.round(d.forecastCloud * 100)} unit="%" tone={d.forecastCloud > obj.maxCloud ? 'warning' : 'pass'} />
          <Stat label={t('dec.capture.sun')} value={`${Math.floor(lst)}:${String(Math.round((lst % 1) * 60)).padStart(2, '0')}`} />
          <Stat label={t('dec.capture.offnadir')} value={d.pass.minOffNadirDeg.toFixed(1)} unit="°" />
          <Stat label={t('dec.capture.gsd')} value={d.predictedGsdM} unit={`m (≤${obj.maxGsdM})`} tone={d.predictedGsdM > obj.maxGsdM ? 'fail' : 'pass'} />
          <Stat label={t('dec.capture.coverage')} value={Math.round(d.predictedCoverage * 100)} unit="%" tone={d.predictedCoverage < 0.7 ? 'fail' : 'pass'} />
          <Stat label={t('dec.capture.energy')} value={d.energyWh} unit="Wh" />
          <Stat label={t('dec.capture.size')} value={d.sizeMB} unit="MB" />
          <Stat label={t('dec.capture.free')} value={Math.round(freeStorageMB(rt, p.design))} unit="MB" tone={freeStorageMB(rt, p.design) < d.sizeMB ? 'fail' : 'pass'} />
        </div>
        <Meter value={d.forecastCloud} max={1} marker={obj.maxCloud} color={d.forecastCloud > obj.maxCloud ? 'var(--amber)' : 'var(--green)'} label={t('dec.capture.forecast')} />
        <p className="mt-1 text-xs text-dim">{t('dec.capture.threshold', { pct: Math.round(obj.maxCloud * 100) })}</p>
        {d.blockedReason && <p className="mt-1 text-sm text-red">✖ {t('dec.blocked', { reason: t(`block.${d.blockedReason}`) })}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <CButton variant="ghost" onClick={() => onChoose('skip')} data-testid="dec-skip">
            {t('ops.skipCapture')}
          </CButton>
          <CButton variant="primary" disabled={!!d.blockedReason} onClick={() => { play('capture'); onChoose('capture'); }} data-testid="dec-capture">
            ◉ {t('ops.capture')}
          </CButton>
        </div>
      </div>
    );
  }
  if (d.kind === 'downlink') {
    return (
      <div>
        <h3 className="font-pixel text-green">⌁ {t('dec.downlink.title', { station: t(`station.${d.contact.stationId}`) })}</h3>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          <Stat label={t('dec.downlink.duration')} value={((d.contact.end - d.contact.start) / 60).toFixed(1)} unit="min" />
          <Stat label={t('dec.downlink.capacity')} value={d.predictedMB} unit="MB" />
          <Stat label={t('dec.downlink.eff')} value={Math.round(d.linkEfficiency * 100)} unit="%" />
          <Stat label={t('ops.remaining', { mb: '' }).trim()} value={Math.round(pendingMB(rt))} unit="MB" />
        </div>
        <p className="mt-1 text-xs text-dim">{t('dec.downlink.queue')}</p>
        {d.blockedReason && <p className="mt-1 text-sm text-red">✖ {t('dec.blocked', { reason: t(`block.${d.blockedReason}`) })}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <CButton variant="ghost" onClick={() => onChoose('skip')}>
            {t('ops.skipPass')}
          </CButton>
          <CButton variant="go" disabled={!!d.blockedReason} onClick={() => { play('beep'); onChoose('send'); }} data-testid="dec-send">
            ⌁ {t('ops.send')}
          </CButton>
        </div>
      </div>
    );
  }
  if (d.kind === 'firstContact') {
    return (
      <div>
        <h3 className="font-pixel text-green">📡 {t('dec.fc.title')}</h3>
        <p className="mt-1 text-sm">{t('dec.fc.body')}</p>
        <DopplerTuner onLocked={() => setTuned(true)} />
        {tuned && (
          <p className="num mt-2 text-sm text-cyan">
            {t('dec.fc.tlm', { soc: Math.round(socAt(rt, rt.t)), mode: t(`ops.mode.${rt.mode}`), free: Math.round(freeStorageMB(rt, p.design)), health: Math.round(rt.health) })}
          </p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <CButton variant={tuned ? 'primary' : 'ghost'} onClick={() => onChoose('ack')} data-testid="dec-ack">
            {t('ops.ack')} ▸
          </CButton>
        </div>
      </div>
    );
  }
  if (d.kind === 'end') {
    return (
      <div>
        <h3 className="font-pixel text-cyan">{t('dec.end.title')}</h3>
        <p className="mt-1 text-sm">{t('dec.end.body')}</p>
        <div className="mt-2 flex justify-end">
          <CButton variant="primary" size="lg" onClick={() => onChoose('end')} data-testid="dec-end">
            {t('dec.end.go')} ▸
          </CButton>
        </div>
      </div>
    );
  }
  return <AnomalyCard d={d} onChoose={onChoose} />;
}

function FileRow({ o, rank }: { o: Observation; rank: number }) {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const move = useStore((s) => s.queueMove);
  const del = useStore((s) => s.queueDelete);
  const cam = getComponent(p.design.parts.payload);
  const reason = cam ? unusableReason(o, objectiveById(p.choices.objective), cam) : 'bands';
  return (
    <li className="border border-line p-1.5 text-xs" data-testid="file-row">
      <div className="flex items-center justify-between gap-1">
        <span className="font-bold">
          #{rank + 1} {t(`zone.${o.zoneId}`)}
        </span>
        {reason ? <StatusChip status="warning" label={t('ops.file.unusable', { reason: t(`ops.reason.${reason}`) })} /> : <StatusChip status="pass" label={t('ops.file.usable')} />}
      </div>
      <div className="num mt-0.5 text-muted">
        {t('ops.file.cloud')} {Math.round(o.cloud * 100)}% · {t('ops.file.cov')} {Math.round(o.coverage * 100)}% · {t('ops.file.gsd')} {o.gsdM} m · {o.sizeMB.toFixed(0)} MB{o.compressed ? ` · ${t('ops.file.compressed')}` : ''}
      </div>
      <Meter value={o.bytesDownMB} max={o.sizeMB} color="var(--green)" label={t('ops.file.down')} />
      <div className="mt-1 flex justify-end gap-1">
        <CButton size="sm" variant="ghost" onClick={() => move(o.id, -1)} aria-label={t('ops.up')}>▲</CButton>
        <CButton size="sm" variant="ghost" onClick={() => move(o.id, 1)} aria-label={t('ops.down')}>▼</CButton>
        <CButton size="sm" variant="danger" onClick={() => del(o.id)} aria-label={t('ops.delete')}>✕</CButton>
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ operations
export function OpsScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const viewT = useStore((s) => s.viewT);
  const animating = useStore((s) => s.animating);
  const speed = useStore((s) => s.speed);
  const setSpeed = useStore((s) => s.setSpeed);
  const setViewT = useStore((s) => s.setViewT);
  const advance = useStore((s) => s.advance);
  const resolve = useStore((s) => s.resolve);
  const toggleAuto = useStore((s) => s.toggleAuto);
  const compress = useStore((s) => s.queueCompress);
  const prioritize = useStore((s) => s.queuePrioritize);
  const endEarly = useStore((s) => s.endEarly);
  const orbitView = useStore((s) => s.orbitView);
  const setOrbitView = useStore((s) => s.setOrbitView);
  const [playing, setPlaying] = useState(true);
  const [scene, setScene] = useState<string>('ops');
  const [seenKinds, setSeenKinds] = useState<string[]>([]);
  const [showLog, setShowLog] = useState(false);
  const rt = p.runtime!;
  const d = p.pendingDecision;
  const obj = objectiveById(p.choices.objective);
  const cam = getComponent(p.design.parts.payload);
  const clock = useClock(viewT);

  // Auto-advance to the next event once the clock animation has caught up.
  useEffect(() => {
    if (!playing || animating || d || rt.ended) return;
    const id = setTimeout(() => {
      const before = useStore.getState().progress?.runtime?.t ?? 0;
      advance();
      setViewT(before, true);
    }, 350);
    return () => clearTimeout(id);
  }, [playing, animating, d, rt.ended, advance, setViewT]);

  // Safety net: if the Phaser loop is paused (background tab / WebGL lost), finish the clock animation anyway.
  useEffect(() => {
    if (!animating) return;
    const s = useStore.getState();
    const target = s.progress?.runtime?.t ?? 0;
    const ms = Math.min(20000, ((target - s.viewT) / Math.max(1, s.speed)) * 1000 + 1500);
    const id = setTimeout(() => {
      const now = useStore.getState();
      if (now.animating) now.setViewT(now.progress?.runtime?.t ?? target, false);
    }, ms);
    return () => clearTimeout(id);
  }, [animating]);

  // Director reacts to the first occurrence of each event type; alarms for anomalies.
  useEffect(() => {
    if (!d || animating) return;
    if (!seenKinds.includes(d.kind) && KIND_SCENE[d.kind]) {
      setScene(KIND_SCENE[d.kind]!);
      setSeenKinds((k) => [...k, d.kind]);
    }
    if (d.kind === 'eclipseDeficit' || d.kind === 'downlinkBottleneck' || d.kind === 'storm') play('alarm');
    else play('chime');
  }, [d, animating, seenKinds]);
  const prevSafe = useRef(rt.safeModeEvents);
  useEffect(() => {
    if (rt.safeModeEvents > prevSafe.current) {
      setScene('opsSafe');
      play('alarm');
    }
    prevSafe.current = rt.safeModeEvents;
  }, [rt.safeModeEvents]);

  const choose = (c: Choice) => {
    const before = useStore.getState().progress?.runtime?.t ?? 0;
    resolve(c);
    setViewT(before, true);
  };

  const soc = socAt(rt, viewT);
  // While animating, show the state as of the displayed clock; once caught up, show live state.
  const view = animating ? stateAtView(rt, viewT) : { observations: rt.observations, storageMB: storageUsedMB(rt) };
  const used = view.storageMB;
  const capMB = storageCapacityMB(p.design);
  const usableBack = cam ? view.observations.filter((o) => o.status === 'downlinked' && unusableReason(o, obj, cam) === null).length : 0;
  const byId = new Map(view.observations.map((o) => [o.id, o]));
  const queueIds = animating ? [...rt.downlinkQueue, ...view.observations.filter((o) => !rt.downlinkQueue.includes(o.id)).map((o) => o.id)] : rt.downlinkQueue;
  const stored = queueIds.map((id) => byId.get(id)).filter((o): o is Observation => !!o && o.status === 'stored');
  const lastTransfer = rt.transfers[rt.transfers.length - 1];
  const transferActive = !!lastTransfer && viewT >= lastTransfer.t && viewT < lastTransfer.t + lastTransfer.durationS && animating;
  const transferFrac = lastTransfer ? Math.max(0, Math.min(1, (viewT - lastTransfer.t) / Math.max(1, lastTransfer.durationS))) : 0;
  const recentLog = rt.log.filter((l) => l.t <= viewT + 1).slice(-40).reverse();

  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.ops" right={<span className="num text-sm text-cyan" data-testid="mission-clock">{clock}</span>} />
      <div className="pass-through grid min-h-0 flex-1 gap-2 p-2 md:grid-cols-[260px_1fr_300px]">
        {/* Spacecraft HUD */}
        <div className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto">
          <Panel title="CUBESAT">
            <div className="flex flex-col gap-1.5">
              <Stat label={t('ops.battery')} value={Math.round(soc)} unit="%" tone={soc < 20 ? 'fail' : soc < 35 ? 'warning' : 'pass'} />
              <Meter value={soc} max={100} marker={20} color={soc < 20 ? 'var(--red)' : soc < 35 ? 'var(--amber)' : 'var(--green)'} label={t('ops.battery')} />
              <Stat label={t('ops.mode')} value={t(`ops.mode.${rt.mode}`)} tone={rt.mode === 'safe' ? 'fail' : rt.mode === 'loadshed' ? 'warning' : 'pass'} />
              <Stat label={t('ops.storage')} value={`${Math.round(used)} / ${capMB}`} unit="MB" tone={used > capMB * 0.9 ? 'warning' : 'pass'} />
              <Meter value={used} max={Math.max(1, capMB)} color="var(--violet)" label={t('ops.storage')} />
              <Stat label={t('ops.health')} value={Math.round(rt.health)} unit="%" tone={rt.health < 50 ? 'fail' : rt.health < 90 ? 'warning' : 'pass'} />
              <Stat label={t('ops.returned')} value={`${usableBack} / ${obj.requiredUsable}`} tone={usableBack >= obj.requiredUsable ? 'pass' : 'info'} />
            </div>
          </Panel>
          <Panel title={t('ops.speed')}>
            <div className="flex flex-col gap-2">
              <Switch label={t('ops.speed')} value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={[{ value: '600', label: '×600' }, { value: '1800', label: '×1800' }, { value: '7200', label: '×7200' }]} />
              <CButton variant={playing ? 'default' : 'primary'} onClick={() => setPlaying(!playing)} data-testid="play-toggle">
                {playing ? '⏸ Pause' : `▶ ${t('ops.next')}`}
              </CButton>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={rt.autoDownlink} onChange={(e) => toggleAuto(e.target.checked)} />
                {t('ops.auto')}
              </label>
              <Switch label="view" value={orbitView} onChange={setOrbitView} options={[{ value: 'region', label: t('ops.view.region') }, { value: 'world', label: t('ops.view.world') }]} />
              <CButton size="sm" variant="ghost" onClick={() => setShowLog(!showLog)}>
                ☰ {t('ops.log')}
              </CButton>
              <CButton size="sm" variant="danger" onClick={() => window.confirm(t('ops.endConfirm')) && endEarly()}>
                {t('ops.endMission')}
              </CButton>
              <div className="flex flex-wrap gap-1">
                <LearnButton id="downlink" />
                <LearnButton id="power" />
              </div>
            </div>
          </Panel>
        </div>

        {/* Centre: map visible; commander, transfer and decision */}
        <div className="pass-through flex min-h-0 flex-col justify-between gap-2">
          <div className="max-w-xl self-center">
            <Commander key={scene} scene={scene} compact autoHide />
          </div>
          <div className="flex flex-col gap-2">
            {transferActive && lastTransfer && (
              <Panel title={t('ops.transfer')} className="mx-auto w-full max-w-xl">
                <Meter value={transferFrac * lastTransfer.sentMB} max={Math.max(1, lastTransfer.capacityMB)} color="var(--green)" />
                <p className="num mt-1 text-xs text-muted">
                  {(transferFrac * lastTransfer.sentMB).toFixed(1)} / {lastTransfer.capacityMB.toFixed(1)} MB
                </p>
              </Panel>
            )}
            {!animating && lastTransfer && !transferActive && d?.kind !== 'downlink' && rt.log[rt.log.length - 1]?.code === 'log.pass' && (
              <p className="panel mx-auto px-3 py-1 text-xs text-green">{t('ops.transferDone', { mb: lastTransfer.sentMB.toFixed(1), files: lastTransfer.files.filter((f) => f.completed).length })}</p>
            )}
            {d && !animating ? (
              <div className={`panel mx-auto w-full max-w-xl p-3 rise-in ${d.kind === 'eclipseDeficit' || d.kind === 'downlinkBottleneck' || d.kind === 'storm' ? 'alarm' : ''}`} data-testid={`decision-${d.kind}`}>
                <DecisionCard key={d.id} d={d} rt={rt} onChoose={choose} />
              </div>
            ) : (
              !animating && !playing && <p className="panel mx-auto px-3 py-2 text-sm text-muted">{t('ops.waiting')}</p>
            )}
          </div>
        </div>

        {/* Files & queue */}
        <div className="scroll-thin flex min-h-0 flex-col gap-2 overflow-y-auto">
          <Panel title={t('ops.files')}>
            <div className="mb-2 flex flex-wrap gap-1">
              <CButton size="sm" onClick={prioritize} disabled={!stored.length}>
                ⇅ {t('ops.prioritize')}
              </CButton>
              {getComponent(p.design.parts.obc)?.compression && (
                <CButton size="sm" onClick={compress} disabled={!stored.some((o) => !o.compressed)}>
                  ⇲ {t('ops.compress')}
                </CButton>
              )}
            </div>
            {stored.length ? (
              <ul className="flex flex-col gap-1.5">
                {stored.map((o, i) => (
                  <FileRow key={o.id} o={o} rank={i} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{t('ops.noFiles')}</p>
            )}
            {view.observations.some((o) => o.status === 'downlinked') && (
              <p className="mt-2 text-xs text-green">
                ✔ {view.observations.filter((o) => o.status === 'downlinked').length} {t('debrief.ds.downlinked')}
              </p>
            )}
          </Panel>
          {showLog && (
            <Panel title={t('ops.log')}>
              <ul className="num flex max-h-72 flex-col gap-1 overflow-y-auto text-[0.7rem]">
                {recentLog.map((l, i) => (
                  <li key={i} className={l.severity === 'bad' ? 'text-red' : l.severity === 'warn' ? 'text-amber' : l.severity === 'good' ? 'text-green' : 'text-muted'}>
                    <LogTime t={l.t} /> {codeText(useStore.getState().settings.locale, l.code, l.params)}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function LogTime({ t }: { t: number }) {
  const c = useClock(t);
  return <span className="text-dim">[{c}]</span>;
}

// ------------------------------------------------------------------ debrief
function ImagePreview({ o, nir }: { o: Observation; nir: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    const W = 64;
    const H = 40;
    let seed = o.id.length * 97 + Math.round(o.t);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = rnd();
        const field = (x + y * 2) % 23 < 4;
        const col = nir ? (field ? `rgb(${200 + v * 40},${80 + v * 40},${90})` : `rgb(${150 + v * 80},${30 + v * 30},${40 + v * 30})`) : field ? `rgb(${120 + v * 40},${110 + v * 30},${60})` : `rgb(${20 + v * 20},${70 + v * 50},${30 + v * 20})`;
        c.fillStyle = col;
        c.fillRect(x, y, 1, 1);
      }
    // River
    c.strokeStyle = nir ? '#101828' : '#3c6a8a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 26);
    c.bezierCurveTo(16, 14, 34, 34, 64, 18);
    c.stroke();
    // Clouds
    for (let i = 0; i < 60 * o.cloud; i++) {
      c.fillStyle = `rgba(240,244,250,${0.5 + rnd() * 0.4})`;
      c.beginPath();
      c.arc(rnd() * W, rnd() * H, 2 + rnd() * 5, 0, Math.PI * 2);
      c.fill();
    }
    // Missed target: crop
    if (o.coverage < 1) {
      c.fillStyle = '#14101a';
      c.fillRect(Math.round(W * o.coverage), 0, W, H);
    }
  }, [o, nir]);
  return <canvas ref={ref} width={64} height={40} className="h-10 w-16 border border-line" style={{ imageRendering: 'pixelated' }} aria-hidden="true" />;
}

function HistoryChart({ rt, cap }: { rt: MissionRuntime; cap: number }) {
  const tr = useT();
  const W = 600;
  const H = 120;
  const T = MISSION_RAJANG.campaignDays * 86400;
  const soc = rt.history.map((h) => `${((h.t / T) * W).toFixed(1)},${(H - (h.socPct / 100) * H).toFixed(1)}`).join(' ');
  const sto = rt.history.map((h) => `${((h.t / T) * W).toFixed(1)},${(H - (h.storageMB / Math.max(1, cap)) * H).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label="Battery and storage history">
      {[0, 20, 50, 100].map((v) => (
        <line key={v} x1={0} x2={W} y1={H - (v / 100) * H} y2={H - (v / 100) * H} stroke="#26385a" strokeDasharray={v === 20 ? '4 3' : undefined} />
      ))}
      {Array.from({ length: MISSION_RAJANG.campaignDays + 1 }).map((_, d) => (
        <text key={d} x={(d / MISSION_RAJANG.campaignDays) * W} y={H + 12} fill="#5f7090" fontSize="9">
          {d}
        </text>
      ))}
      <polyline points={sto} fill="none" stroke="#9b8cff" strokeWidth="1.5" />
      <polyline points={soc} fill="none" stroke="#7ee081" strokeWidth="1.5" />
      <text x={W - 120} y={12} fill="#7ee081" fontSize="10">
        ● {tr('ops.battery')} %
      </text>
      <text x={W - 120} y={24} fill="#9b8cff" fontSize="10">
        ● {tr('ops.storage')}
      </text>
    </svg>
  );
}

export function DebriefScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const locale = useStore((s) => s.settings.locale);
  const achievements = useStore((s) => s.achievements);
  const redesign = useStore((s) => s.redesign);
  const flyAgain = useStore((s) => s.flyAgain);
  const openModal = useStore((s) => s.openModal);
  const out = p.outcome;
  const rt = p.runtime;
  const cam = getComponent(p.design.parts.payload);
  const obj = objectiveById(p.choices.objective);
  const scene = out?.kind === 'success' ? 'debriefSuccess' : out?.kind === 'partial' ? 'debriefPartial' : 'debriefFailure';
  const rows = useMemo(() => rt?.observations ?? [], [rt]);
  if (!out || !rt) return null;
  const color = out.kind === 'success' ? 'text-green border-green' : out.kind === 'partial' ? 'text-amber border-amber' : 'text-red border-red';
  const scoreRows = [
    ['science', out.score.science, SCORE_WEIGHTS.science],
    ['engineering', out.score.engineering, SCORE_WEIGHTS.engineering],
    ['operations', out.score.operations, SCORE_WEIGHTS.operations],
    ['budget', out.score.budget, SCORE_WEIGHTS.budget],
    ['recovery', out.score.recovery, SCORE_WEIGHTS.recovery],
  ] as const;
  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.debrief" />
      <div className="scroll-thin grid flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[1fr_380px]" style={{ background: 'rgba(4,7,15,0.55)' }}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className={`stamp font-pixel border-4 px-5 py-2 text-3xl ${color}`} data-testid="debrief-verdict">
              {t(`debrief.${out.kind}`)}
            </div>
            <div className="num flex gap-4 text-sm">
              <div>
                <div className="engraved">{t('debrief.returned')}</div>
                <div className="text-2xl">
                  {out.usableReturned}/{out.required}
                </div>
              </div>
              <div>
                <div className="engraved">{t('debrief.zones')}</div>
                <div className="text-2xl">
                  {out.zonesCovered}/{out.requiredZones}
                </div>
              </div>
              <div>
                <div className="engraved">{t('debrief.health')}</div>
                <div className="text-2xl">{Math.round(rt.health)}%</div>
              </div>
            </div>
          </div>
          <Commander scene={scene} compact />
          <Panel title={t('debrief.what')}>
            <ul className="flex flex-col gap-1 text-sm">
              {out.reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <StatusChip status={r.severity} label="" /> {codeText(locale, r.code, r.params)}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t('debrief.recs')}>
            <ul className="flex flex-col gap-1 text-sm text-cyan">
              {out.recommendations.map((r, i) => (
                <li key={i}>▸ {codeText(locale, r.code, r.params)}</li>
              ))}
              {!out.recommendations.length && <li>▸ ✔</li>}
            </ul>
          </Panel>
          <Panel title={t('debrief.datasets')}>
            <p className="mb-2 text-xs text-dim">{t('debrief.preview')}</p>
            <div className="scroll-thin overflow-x-auto">
              <table className="num w-full text-xs">
                <tbody>
                  {rows.map((o) => {
                    const reason = cam ? unusableReason(o, obj, cam) : 'bands';
                    return (
                      <tr key={o.id} className="border-t border-line">
                        <td className="p-1"><ImagePreview o={o} nir={cam?.bands === 'RGB+NIR'} /></td>
                        <td className="p-1 font-bold">{t(`zone.${o.zoneId}`)}</td>
                        <td className="p-1">{Math.round(o.cloud * 100)}% ☁</td>
                        <td className="p-1">{o.gsdM} m</td>
                        <td className="p-1">{Math.round(o.coverage * 100)}%</td>
                        <td className="p-1">{t(`debrief.ds.${o.status}`)}</td>
                        <td className="p-1">{reason ? <StatusChip status="warning" label={t(`ops.reason.${reason}`)} /> : <StatusChip status="pass" />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">{t('debrief.limits')}</p>
            <p className="mt-1 text-xs text-dim">{t('debrief.reference')}</p>
          </Panel>
          <Panel title={t('debrief.chart')}>
            <HistoryChart rt={rt} cap={storageCapacityMB(p.design)} />
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title={t('debrief.score')}>
            <div className="font-pixel mb-2 text-4xl text-yellow" data-testid="score-total">{out.score.total}</div>
            <div className="flex flex-col gap-1.5">
              {scoreRows.map(([k, v, w]) => (
                <div key={k}>
                  <Stat label={`${t(`debrief.score.${k}`)} (${Math.round(w * 100)}%)`} value={v} />
                  <Meter value={v} max={100} color="var(--yellow)" />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[0.7rem] text-dim">{t('debrief.scoreNote')}</p>
          </Panel>
          <Panel title={t('debrief.achievements')}>
            <ul className="flex flex-col gap-1 text-sm">
              {achievements.map((a) => (
                <li key={a}>
                  ★ <span className="font-bold text-yellow">{t(`ach.${a}`)}</span> <span className="text-xs text-muted">{t(`ach.${a}.d`)}</span>
                </li>
              ))}
              {!achievements.length && <li className="text-muted">—</li>}
            </ul>
          </Panel>
          <CButton variant="primary" size="lg" onClick={redesign} data-testid="redesign">
            ⟲ {t('debrief.redesign')}
          </CButton>
          <CButton onClick={() => flyAgain(false)}>{t('debrief.retryOps')}</CButton>
          <CButton onClick={() => flyAgain(true)}>☁ {t('debrief.newWeather')}</CButton>
          <CButton variant="ghost" onClick={() => openModal({ kind: 'quiz', which: 'post' })}>
            ? {t('debrief.quiz')}
          </CButton>
          <p className="text-xs text-dim">{t('debrief.learning')}</p>
          <div className="panel p-2">
            <Panel title={t('debrief.timeline')}>
              <ul className="num flex max-h-64 flex-col gap-0.5 overflow-y-auto text-[0.68rem]">
                {rt.log.slice(-60).map((l, i) => (
                  <li key={i} className={l.severity === 'bad' ? 'text-red' : l.severity === 'warn' ? 'text-amber' : l.severity === 'good' ? 'text-green' : 'text-muted'}>
                    <LogTime t={l.t} /> {codeText(locale, l.code, l.params)}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
