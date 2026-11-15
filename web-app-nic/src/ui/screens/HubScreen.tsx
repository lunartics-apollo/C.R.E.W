// Station HUD in the Godot game's style: room banner, objective box, use-prompt and a corner minimap.
// The walking itself happens in the Phaser StationScene.
import { useEffect, useRef, useState } from 'react';
import { bridge } from '../../game/bridge';
import { MAP_H, MAP_W, stationMap } from '../../game/stationMap';
import { useStore, useT } from '../../state/store';
import { play } from '../../audio/sfx';
import { CButton } from '../components/Controls';

const MM_W = 132;
const MM_H = Math.round((MM_W * MAP_H) / MAP_W);

function lighten(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = useStore((s) => s.progress?.phase);
  useEffect(() => {
    const map = stationMap();
    const target = map.spotForPhase(phase);
    let raf = 0;
    const k = MM_W / MAP_W;
    const draw = (t: number) => {
      const c = ref.current?.getContext('2d');
      if (c) {
        c.imageSmoothingEnabled = false;
        c.fillStyle = '#4d6b3c';
        c.fillRect(0, 0, MM_W, MM_H);
        for (const r of map.rooms) {
          c.fillStyle = '#2a2d30';
          c.fillRect(r.outer.x * k, r.outer.y * k, r.outer.w * k, r.outer.h * k);
        }
        for (const r of map.rooms) {
          c.fillStyle = lighten(r.floor, 0.25);
          c.fillRect(r.rect.x * k, r.rect.y * k, r.rect.w * k, r.rect.h * k);
        }
        c.fillStyle = '#c7c2b4';
        c.fillRect(1605 * k, 630 * k, 228 * k, 420 * k); // launch complex apron
        const on = Math.floor(t / 350) % 2 === 0;
        if (target) {
          c.fillStyle = on ? '#f2c94c' : '#7a3b2e';
          c.fillRect(target.pos.x * k - 2, target.pos.y * k - 2, 5, 5);
        }
        const p = bridge.playerPos;
        if (p) {
          c.fillStyle = '#1c1622';
          c.fillRect(p.x * k - 3, p.y * k - 3, 7, 7);
          c.fillStyle = '#fff4dc';
          c.fillRect(p.x * k - 2, p.y * k - 2, 5, 5);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  return (
    <div className="panel pointer-events-auto p-1.5" title="Click to walk there">
      <canvas
        ref={ref}
        width={MM_W}
        height={MM_H}
        style={{ imageRendering: 'pixelated', display: 'block', cursor: 'pointer' }}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          bridge.walkTo?.(((e.clientX - r.left) / r.width) * MAP_W, ((e.clientY - r.top) / r.height) * MAP_H);
        }}
      />
    </div>
  );
}

export function HubScreen() {
  const t = useT();
  const phase = useStore((s) => s.progress?.phase);
  const openModal = useStore((s) => s.openModal);
  const [near, setNear] = useState<string | null>(null);
  const [room, setRoom] = useState('');
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

      {/* bottom-right: minimap */}
      <div className="absolute bottom-3 right-3">
        <Minimap />
      </div>

      {/* bottom-centre: use prompt */}
      <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-2 px-3">
        {nearSpot ? (
          <CButton variant={here ? 'primary' : 'default'} size="lg" className="pointer-events-auto" onClick={use}>
            <span className="key-cap">E</span> {t('hub.use')} · {nearSpot.name}
          </CButton>
        ) : (
          <div className="panel px-3 py-1.5 text-xs text-muted">{t('hub.walk')}</div>
        )}
      </div>
    </div>
  );
}
