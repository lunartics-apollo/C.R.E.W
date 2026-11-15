// Menu, "Our Home: Sarawak" map, incoming transmission and mission briefing.
import { useMemo } from 'react';
import regionData from '../../data/geo/region.json';
import { RAJANG_LINE, TOWNS } from '../../data/rajang';
import { MISSION_RAJANG, OBJECTIVES, objectiveById } from '../../simulation/mission';
import type { ObjectiveId, ZoneId } from '../../simulation/types';
import { useStore, useT } from '../../state/store';
import { play } from '../../audio/sfx';
import { CButton, Panel, Switch } from '../components/Controls';
import { Commander } from '../components/Commander';
import { LearnButton, TopBar } from '../components/Shared';

// ------------------------------------------------------------------ menu
export function MenuScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const progress = useStore((s) => s.progress);
  const startMission = useStore((s) => s.startMission);
  const startDemo = useStore((s) => s.startDemo);
  const openModal = useStore((s) => s.openModal);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const canResume = !!progress;
  const start = () => {
    if (canResume && !window.confirm(t('menu.newConfirm'))) return;
    startMission();
    onClose();
  };
  return (
    <div className="ui-layer scroll-thin flex flex-col items-center justify-center gap-5 overflow-y-auto p-4">
      <div className="pointer-events-none text-center rise-in">
        <div className="engraved mb-2">Sarawak Space Academy · {t('menu.version')}</div>
        <h1 className="font-pixel text-4xl leading-none text-cyan sm:text-6xl" style={{ textShadow: '0 0 18px rgba(90,209,230,0.55), 0 4px 0 #04121a' }}>
          {t('app.title')}
        </h1>
        <p className="font-pixel mt-2 text-lg text-amber sm:text-2xl" style={{ textShadow: '0 2px 0 #3a2200' }}>
          {t('app.subtitle')}
        </p>
      </div>
      <nav className="panel flex w-full max-w-md flex-col gap-2 p-4 rise-in" aria-label="Main menu">
        <CButton variant="primary" size="xl" onClick={start} autoFocus>
          ▶ {t('menu.start')}
        </CButton>
        {canResume && (
          <CButton size="lg" onClick={onClose}>
            {t('menu.resumeAt', { phase: t(`phase.${progress.phase}`) })}
          </CButton>
        )}
        <div className="grid grid-cols-2 gap-2">
          <CButton onClick={() => openModal({ kind: 'howto' })}>{t('menu.howto')}</CButton>
          <CButton onClick={() => openModal({ kind: 'settings' })}>{t('menu.settings')}</CButton>
          <CButton onClick={() => openModal({ kind: 'sources' })}>{t('menu.sources')}</CButton>
          <CButton onClick={() => openModal({ kind: 'archive' })}>{t('menu.archive')}</CButton>
          <CButton onClick={() => openModal({ kind: 'educator' })}>{t('menu.educator')}</CButton>
          <CButton onClick={() => openModal({ kind: 'credits' })}>{t('menu.credits')}</CButton>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <Switch label={t('settings.language')} value={settings.locale} onChange={(v) => setSettings({ locale: v })} options={[{ value: 'en', label: 'English' }, { value: 'ms', label: 'Bahasa Melayu' }]} />
          <CButton
            size="sm"
            variant="ghost"
            title={t('menu.demoHint')}
            onClick={() => {
              if (canResume && !window.confirm(t('menu.newConfirm'))) return;
              startDemo();
              onClose();
            }}
          >
            ⚑ {t('menu.demo')}
          </CButton>
        </div>
      </nav>
      <p className="max-w-xl text-center text-xs text-dim">{t('app.fiction')}</p>
    </div>
  );
}

// ------------------------------------------------------------------ Sarawak map (SVG, accessible)
const MAP = { lon0: 108.6, lon1: 119.6, lat0: 0.6, lat1: 7.4 };
function mp(lon: number, lat: number, w: number, h: number): [number, number] {
  return [((lon - MAP.lon0) / (MAP.lon1 - MAP.lon0)) * w, ((MAP.lat1 - lat) / (MAP.lat1 - MAP.lat0)) * h];
}

export function SarawakMap({ onRiver, found, highlightZones, priority }: { onRiver?: () => void; found?: boolean; highlightZones?: boolean; priority?: ZoneId }) {
  const t = useT();
  const W = 660;
  const H = 408;
  const shapes = useMemo(() => {
    const out: { d: string; sarawak: boolean }[] = [];
    for (const sh of (regionData as { shapes: { c: string; p: number[][] }[] }).shapes) {
      if (!sh.p.some(([lon, lat]) => lon! > MAP.lon0 - 2 && lon! < MAP.lon1 + 2 && lat! > MAP.lat0 - 2 && lat! < MAP.lat1 + 2)) continue;
      const d = sh.p.map(([lon, lat], i) => `${i ? 'L' : 'M'}${mp(lon!, lat!, W, H).map((v) => v.toFixed(1)).join(',')}`).join('') + 'Z';
      const sarawak = sh.c === 'MY' && sh.p.some(([lon, lat]) => lon! > 109.5 && lon! < 115.6 && lat! < 5.2 && lat! > 0.8);
      out.push({ d, sarawak });
    }
    return out;
  }, []);
  const river = RAJANG_LINE.map(([lon, lat], i) => `${i ? 'L' : 'M'}${mp(lon, lat, W, H).join(',')}`).join('');
  const label = (txt: string, lon: number, lat: number, fill: string, size: number) => {
    const [x, y] = mp(lon, lat, W, H);
    return (
      <text x={x} y={y} fill={fill} fontFamily="Silkscreen" fontSize={size}>
        {txt}
      </text>
    );
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Map of Sarawak with the Rajang River">
      <defs>
        <pattern id="sea" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#061527" />
          <rect width="1" height="1" fill="#0b2340" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#sea)" />
      {shapes.map((s, i) => (
        <path key={i} d={s.d} fill={s.sarawak ? '#1f4a35' : '#14281f'} stroke={s.sarawak ? '#7ee081' : '#2f5a48'} strokeWidth={s.sarawak ? 1.4 : 0.8} />
      ))}
      {label('SARAWAK', 112.4, 3.6, '#7ee081', 16)}
      {label('SABAH', 116.4, 5.8, '#3f6b58', 11)}
      {label('KALIMANTAN', 113.5, 1.0, '#3f6b58', 11)}
      {label('SOUTH CHINA SEA', 109.0, 5.5, '#2b5a7a', 11)}
      <path d={river} fill="none" stroke={found ? '#8ff0ff' : '#f2c94c'} strokeWidth={found ? 5 : 3.5} strokeLinejoin="round" strokeLinecap="round" style={{ filter: found ? 'drop-shadow(0 0 6px #f2c94c)' : undefined }} />
      {onRiver && (
        <path
          d={river}
          fill="none"
          stroke="transparent"
          strokeWidth={28}
          style={{ cursor: 'pointer' }}
          data-testid="rajang-hit"
          onClick={() => {
            play('success');
            onRiver();
          }}
        />
      )}
      {TOWNS.map((tw) => {
        const [x, y] = mp(tw.lon, tw.lat, W, H);
        return (
          <g key={tw.name}>
            <rect x={x - 2.5} y={y - 2.5} width={5} height={5} fill="#e6eefc" />
            <text x={x + 6} y={y - 4} fill="#c9d3e6" fontSize="11" fontFamily="Chakra Petch">
              {tw.name}
            </text>
          </g>
        );
      })}
      {highlightZones &&
        MISSION_RAJANG.zones.map((z) => {
          const [x, y] = mp(z.lonDeg, z.latDeg, W, H);
          const pri = z.id === priority;
          return (
            <g key={z.id}>
              <circle cx={x} cy={y} r={pri ? 14 : 10} fill="none" stroke={pri ? '#ffd86b' : '#f2b33d'} strokeWidth={pri ? 2.5 : 1.5} strokeDasharray={pri ? undefined : '4 3'} />
              <text x={x + 10} y={y + (z.id === 'sibu' ? -14 : 20)} fill={pri ? '#ffd86b' : '#f2b33d'} fontSize="12" fontFamily="Chakra Petch" fontWeight="700">
                {t(`zone.${z.id}`)}
              </text>
            </g>
          );
        })}
    </svg>
  );
}

export function TransmissionScreen() {
  const t = useT();
  const goPhase = useStore((s) => s.goPhase);
  const openModal = useStore((s) => s.openModal);
  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.transmission" />
      <div className="scroll-thin mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-4 overflow-y-auto p-3">
        {/* The director's own Continue (on his last line) takes you to the team meeting: one button, no second one. */}
        <Commander scene="transmission" onDone={() => goPhase('meeting')} />
        <div className="flex justify-end">
          <CButton size="sm" variant="ghost" onClick={() => openModal({ kind: 'quiz', which: 'pre' })}>
            ? {t('tx.quizTake')}
          </CButton>
        </div>
      </div>
    </div>
  );
}

export function BriefingScreen() {
  const t = useT();
  const p = useStore((s) => s.progress)!;
  const setChoices = useStore((s) => s.setChoices);
  const goPhase = useStore((s) => s.goPhase);
  const obj = objectiveById(p.choices.objective);
  return (
    <div className="ui-layer flex flex-col">
      <TopBar phaseKey="phase.briefing" />
      <div className="scroll-thin grid flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-3">
          <Commander scene="briefing" compact />
          <Panel title={t('brief.question')}>
            <p className="text-sm italic leading-relaxed">“{t('brief.questionText')}”</p>
          </Panel>
          <Panel title={t('brief.objective')}>
            <div className="grid gap-2 md:grid-cols-3">
              {OBJECTIVES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="part-card p-3 text-left"
                  data-installed={p.choices.objective === o.id}
                  aria-pressed={p.choices.objective === o.id}
                  onClick={() => {
                    play('click');
                    setChoices({ objective: o.id as ObjectiveId });
                  }}
                >
                  <div className="font-bold text-ink">{t(`obj.${o.id}`)}</div>
                  <p className="mt-1 text-xs text-muted">{t(`obj.${o.id}.desc`)}</p>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title={t('brief.priority')}>
            <Switch label={t('brief.priority')} value={p.choices.priorityZone} onChange={(v) => setChoices({ priorityZone: v })} options={MISSION_RAJANG.zones.map((z) => ({ value: z.id, label: t(`zone.${z.id}`) }))} />
            <div className="mt-2 max-w-xl">
              <SarawakMap highlightZones priority={p.choices.priorityZone} found />
            </div>
          </Panel>
        </div>
        <div className="flex flex-col gap-3">
          <Panel title={t('brief.req')}>
            <ol className="flex flex-col gap-2 text-sm">
              <li>☐ {t('brief.req.n', { n: obj.requiredUsable })}</li>
              <li>☐ {t('brief.req.zones', { n: obj.requiredZones })}</li>
              <li>☐ {t('brief.req.cloud', { pct: Math.round(obj.maxCloud * 100) })}</li>
              <li>☐ {t('brief.req.gsd', { m: obj.maxGsdM })}</li>
              {obj.needsNir && <li className="text-amber">☐ {t('brief.req.nir')}</li>}
              <li>☐ {t('brief.req.days', { d: MISSION_RAJANG.campaignDays })}</li>
            </ol>
            <p className="mt-3 text-xs text-muted">{t('brief.budget', { cr: MISSION_RAJANG.budgetCr[p.choices.mode] })}</p>
            <p className="mt-2 border-l-2 border-amber pl-2 text-xs text-muted">{t('brief.limits')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <LearnButton id="cubesat" />
              <LearnButton id="cloud" />
              <LearnButton id="budget" />
            </div>
          </Panel>
          <CButton variant="primary" size="lg" onClick={() => goPhase('hangar')}>
            ✔ {t('brief.accept')}
          </CButton>
        </div>
      </div>
    </div>
  );
}
