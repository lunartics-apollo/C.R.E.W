// Academy campus HUD: shows where to walk next. The walking itself happens in the Phaser StationScene.
import { useEffect, useState } from 'react';
import { bridge } from '../../game/bridge';
import { SPOTS, spotById, spotForPhase, type SpotId } from '../../game/stationMap';
import { translate } from '../../i18n';
import { useStore, useT } from '../../state/store';
import { play } from '../../audio/sfx';
import { CButton } from '../components/Controls';
import { TopBar } from '../components/Shared';

export function HubScreen() {
  const t = useT();
  const locale = useStore((s) => s.settings.locale);
  const phase = useStore((s) => s.progress?.phase);
  const [near, setNear] = useState<SpotId | null>(null);
  const next = spotForPhase(phase);
  const place = (id: SpotId) => translate(locale, `hub.spot.${id}`);

  useEffect(() => {
    const offNear = bridge.on('hubNear', (id) => setNear((id as SpotId | null) ?? null));
    const offTry = bridge.on('hubTry', ({ id, ok }) => {
      const spot = SPOTS.find((s) => s.id === id);
      if (!spot) return;
      if (ok) {
        play('click');
        useStore.getState().setHub(false);
      } else if (next) {
        useStore.getState().toast(t('hub.notYet', { place: place(next.id) }), 'warn');
      }
    });
    return () => {
      offNear();
      offTry();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.id, locale]);

  // Touch players have no E key: the button does the same thing.
  const enterNear = () => {
    if (!near) return;
    const spot = spotById(near);
    bridge.emit('hubTry', { id: near, ok: !!phase && spot.phases.includes(phase) });
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col">
      <TopBar phaseKey="hub.title" />
      <div className="flex-1" />
      <div className="pointer-events-none flex flex-col items-center gap-2 px-3 pb-3">
        {near && (
          <CButton variant={next?.id === near ? 'primary' : 'default'} size="lg" className="pointer-events-auto" onClick={enterNear}>
            {t('hub.enter')} · {place(near)}
          </CButton>
        )}
        <section className="panel pointer-events-auto w-full max-w-xl px-4 py-2.5 text-center" aria-live="polite">
          {next && <div className="font-pixel text-[0.62rem] tracking-widest text-cyan">{t('hub.next', { place: place(next.id).toUpperCase() })}</div>}
          <div className="mt-1 text-sm text-ink">{phase ? t(`hub.obj.${phase}`) : ''}</div>
          <div className="mt-1 text-xs text-dim">{t('hub.walk')}</div>
        </section>
      </div>
    </div>
  );
}
