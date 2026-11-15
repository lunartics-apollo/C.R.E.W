// Station HUD in the Godot game's style: room banner, objective box, use-prompt and a corner minimap.
// The walking itself happens in the Phaser StationScene.
import { useEffect, useState } from 'react';
import { bridge } from '../../game/bridge';
import { stationMap } from '../../game/stationMap';
import { useStore, useT } from '../../state/store';
import { play } from '../../audio/sfx';
import { CButton } from '../components/Controls';
import { StationMinimap } from '../components/StationMinimap';

export function HubScreen() {
  const t = useT();
  const phase = useStore((s) => s.progress?.phase);
  const openModal = useStore((s) => s.openModal);
  const [near, setNear] = useState<string | null>(null);
  const [room, setRoom] = useState('');
  const [fullMap, setFullMap] = useState(false);
  const [clock, setClock] = useState(bridge.clock.minutes);
  const map = stationMap();
  const next = map.spotForPhase(phase);
  const nearSpot = near ? (map.spots.get(near) ?? null) : null;
  const here = nearSpot !== null && nearSpot.id === next?.id;

  useEffect(() => {
    const offNear = bridge.on('hubNear', (id) => setNear(id));
    const offRoom = bridge.on('hubRoom', (name) => setRoom(name));
    const offTry = bridge.on('hubTry', ({ id, ok }) => {
      if (ok) {
        play('click');
        useStore.getState().setHub(false);
      } else if (next) {
        const label = id === next.id ? next.name : `${next.name} (${map.rooms.find((r) => r.id === next.room)?.name ?? ''})`;
        useStore.getState().toast(t('hub.notYet', { place: label }), 'warn');
      }
    });
    return () => {
      offNear();
      offRoom();
      offTry();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.id]);

  useEffect(() => {
    const id = setInterval(() => setClock(bridge.clock.minutes), 500);
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !e.repeat) {
        e.stopPropagation();
        setFullMap((v) => !v);
      }
      if (e.key === 'Escape') setFullMap(false);
    };
    window.addEventListener('keydown', key, true);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', key, true);
    };
  }, []);
  const hh = Math.floor(clock / 60) % 24;
  const mm = Math.floor(clock % 60);
  const clockText = `DAY ${bridge.clock.day}  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  const use = () => {
    if (near) bridge.emit('hubTry', { id: near, ok: near === next?.id });
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      {/* top-left: room banner + objective */}
      <div className="absolute left-3 top-3 flex max-w-[min(26rem,60vw)] flex-col gap-2">
        <div className="panel self-start px-3 py-1.5" style={{ ['--frame' as string]: "url('/ui/banner.png')" }}>
          <span className="font-pixel text-[0.65rem] tracking-widest text-ink">{room || t('hub.title').toUpperCase()}</span>
        </div>
        <div className="panel px-3 py-2">
          <div className="font-pixel text-[0.58rem] tracking-widest text-cyan">{t('hub.objective')}</div>
          <div className="mt-1 text-sm text-ink">{phase ? t(`hub.obj.${phase}`) : ''}</div>
        </div>
        {phase === 'briefing' && (
          <div className="panel px-3 py-2" aria-live="polite">
            <div className="font-pixel text-[0.58rem] tracking-widest text-cyan">{t('hub.tut.title')}</div>
            <ol className="mt-1 flex flex-col gap-1 text-sm">
              {(['move', 'go', 'use'] as const).map((step) => {
                const active = step === 'use' ? here : step === 'go' ? !here : !here && !room.startsWith('MISSION');
                return (
                  <li key={step} className={active ? 'text-yellow' : 'text-dim'}>
                    {active ? '▸ ' : '· '}
                    {t(`hub.tut.${step}`)}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {/* top-right: menu */}
      <div className="pointer-events-auto absolute right-3 top-3 flex items-start gap-2">
        <CButton size="sm" variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent('bs:menu'))}>
          ☰ {t('common.menu')}
        </CButton>
        <CButton size="sm" variant="ghost" onClick={() => openModal({ kind: 'settings' })} aria-label={t('menu.settings')}>
          ⚙
        </CButton>
      </div>

      {/* bottom-right: zoomed minimap centred on you, like the Godot game (M = whole station) */}
      <div className="pointer-events-auto absolute bottom-3 right-3">
        <div className="panel p-1.5" title="M: station map. Click to walk there.">
          <StationMinimap mode="corner" width={192} height={168} onWalk={(x, y) => bridge.walkTo?.(x, y)} />
        </div>
      </div>

      {/* clock */}
      <div className="panel absolute left-1/2 top-3 -translate-x-1/2 px-3 py-1.5">
        <span className="font-pixel text-[0.62rem] tracking-widest text-ink">{clockText}</span>
      </div>

      {fullMap && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[rgba(16,20,24,0.9)] p-4" onClick={() => setFullMap(false)}>
          <div className="flex flex-col items-center gap-2">
            <div className="font-pixel text-sm tracking-widest text-cyan">STATION MAP</div>
            <StationMinimap mode="full" width={Math.min(640, window.innerWidth - 32)} height={Math.round((Math.min(640, window.innerWidth - 32) * 1440) / 1920)} onWalk={(x, y) => { bridge.walkTo?.(x, y); setFullMap(false); }} />
            <div className="text-xs text-muted">Click a place to walk there. M or Esc to close.</div>
          </div>
        </div>
      )}

      {/* bottom-centre: use prompt */}
      <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
        {nearSpot ? (
          <CButton variant={here ? 'primary' : 'default'} size="lg" className="pointer-events-auto" onClick={use}>
            <span className="key-cap">E</span> {t('hub.use')} · {nearSpot.name}{here ? '' : ' (optional)'}
          </CButton>
        ) : (
          <div className="panel px-3 py-1.5 text-xs text-muted">{t('hub.walk')}</div>
        )}
      </div>
    </div>
  );
}
