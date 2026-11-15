// Mounts exactly one Phaser game behind the React UI and switches scenes with the mission phase.
import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { BASE_H, BASE_W, bridge } from './bridge';
import { SkyScene } from './scenes/SkyScene';
import { HangarScene } from './scenes/HangarScene';
import { LaunchScene } from './scenes/LaunchScene';
import { OrbitScene } from './scenes/OrbitScene';
import { StationScene } from './scenes/StationScene';
import { useStore } from '../state/store';
import type { Phase } from '../state/saveSchema';

export function sceneForPhase(phase: Phase | 'menu'): 'sky' | 'hangar' | 'launch' | 'orbit' | 'station' {
  switch (phase) {
    case 'hangar':
    case 'testlab':
    case 'mrr':
      return 'hangar';
    case 'launch':
      return 'launch';
    case 'launchPlan':
    case 'ops':
    case 'debrief':
      return 'orbit';
    default:
      return 'sky';
  }
}

export function PhaserHost({ menuOpen }: { menuOpen: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ref.current || bridge.game) return;
    try {
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: ref.current,
        width: BASE_W,
        height: BASE_H,
        backgroundColor: '#1c1622',
        pixelArt: true,
        roundPixels: true,
        banner: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [SkyScene, HangarScene, LaunchScene, OrbitScene, StationScene],
        fps: { target: 60, limit: 60 },
        audio: { noAudio: true },
      });
      bridge.game = game;
      game.events.once('ready', () => {
        switchTo(targetScene(menuOpen));
      });
    } catch {
      setFailed(true);
    }
    return () => {
      bridge.game?.destroy(true);
      bridge.game = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const apply = () => switchTo(targetScene(menuOpen));
    apply();
    return useStore.subscribe((s, prev) => {
      if (s.progress?.phase !== prev.progress?.phase || s.hub !== prev.hub) apply();
    });
  }, [menuOpen]);

  if (failed) {
    return (
      <div className="phaser-layer flex items-end justify-center p-4 text-sm text-muted">
        WebGL is not available on this device — the game still runs, but without animated scenes.
      </div>
    );
  }
  return <div ref={ref} className="phaser-layer" aria-hidden="true" />;
}

function targetScene(menuOpen: boolean): SceneKey {
  if (menuOpen) return 'sky';
  const st = useStore.getState();
  return st.hub ? 'station' : sceneForPhase(st.progress?.phase ?? 'menu');
}

type SceneKey = 'sky' | 'hangar' | 'launch' | 'orbit' | 'station';
let current: string | null = null;
function switchTo(key: SceneKey) {
  const game = bridge.game;
  if (!game || !game.isBooted) return;
  if (current === key && game.scene.isActive(key)) {
    if (key === 'launch') game.scene.getScene(key)?.scene.restart();
    return;
  }
  for (const k of ['sky', 'hangar', 'launch', 'orbit', 'station']) if (k !== key && game.scene.isActive(k)) game.scene.stop(k);
  game.scene.start(key);
  current = key;
}
