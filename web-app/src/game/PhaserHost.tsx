// Mounts exactly one Phaser game behind the React UI and switches scenes with the mission phase.
import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { BASE_H, BASE_W, bridge } from './bridge';
import { SkyScene } from './scenes/SkyScene';
import { HangarScene } from './scenes/HangarScene';
import { LaunchScene } from './scenes/LaunchScene';
import { OrbitScene } from './scenes/OrbitScene';
import { useStore } from '../state/store';
import type { Phase } from '../state/saveSchema';

export function sceneForPhase(phase: Phase | 'menu'): 'sky' | 'hangar' | 'launch' | 'orbit' {
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
        backgroundColor: '#070b16',
        pixelArt: true,
        roundPixels: true,
        banner: false,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [SkyScene, HangarScene, LaunchScene, OrbitScene],
        fps: { target: 60, limit: 60 },
        audio: { noAudio: true },
      });
      bridge.game = game;
      game.events.once('ready', () => {
        const phase = useStore.getState().progress?.phase ?? 'menu';
        switchTo(menuOpen ? 'sky' : sceneForPhase(phase));
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
    const apply = () => {
      const phase = useStore.getState().progress?.phase ?? 'menu';
      switchTo(menuOpen ? 'sky' : sceneForPhase(phase));
    };
    apply();
    return useStore.subscribe((s, prev) => {
      if (s.progress?.phase !== prev.progress?.phase) apply();
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

let current: string | null = null;
function switchTo(key: 'sky' | 'hangar' | 'launch' | 'orbit') {
  const game = bridge.game;
  if (!game || !game.isBooted) return;
  if (current === key && game.scene.isActive(key)) {
    if (key === 'launch') game.scene.getScene(key)?.scene.restart();
    return;
  }
  for (const k of ['sky', 'hangar', 'launch', 'orbit']) if (k !== key && game.scene.isActive(k)) game.scene.stop(k);
  game.scene.start(key);
  current = key;
}
