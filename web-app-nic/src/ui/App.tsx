// Root: one Phaser game behind the UI, phase-routed screens, modals, toasts, settings side-effects.
import { useEffect, useState } from 'react';
import { PhaserHost } from '../game/PhaserHost';
import { configureAudio, unlockAudio } from '../audio/sfx';
import { useStore, wantsStation } from '../state/store';
import { Modals } from './Modals';
import { Toasts } from './components/Shared';
import { BriefingScreen, MenuScreen, TransmissionScreen } from './screens/StoryScreens';
import { MeetingScreen } from './screens/MeetingScreen';
import { HangarScreen } from './screens/HangarScreen';
import { GroundScreen, LaunchPlanScreen } from './screens/PlanningScreens';
import { MrrScreen, TestLabScreen } from './screens/ReadinessScreens';
import { HubScreen } from './screens/HubScreen';
import { DebriefScreen, LaunchScreen, OpsScreen } from './screens/FlightScreens';

function PhaseScreen() {
  const phase = useStore((s) => s.progress?.phase);
  const hub = useStore((s) => s.hub);
  if (hub) return <HubScreen />;
  switch (phase) {
    case 'transmission':
      return <TransmissionScreen />;
    case 'meeting':
      return <MeetingScreen />;
    case 'briefing':
      return <BriefingScreen />;
    case 'hangar':
      return <HangarScreen />;
    case 'launchPlan':
      return <LaunchPlanScreen />;
    case 'ground':
      return <GroundScreen />;
    case 'testlab':
      return <TestLabScreen />;
    case 'mrr':
      return <MrrScreen />;
    case 'launch':
      return <LaunchScreen />;
    case 'ops':
      return <OpsScreen />;
    case 'debrief':
      return <DebriefScreen />;
    default:
      return null;
  }
}

export function App() {
  const loaded = useStore((s) => s.loaded);
  const progress = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const [menuOpen, setMenuOpen] = useState(true);

  useEffect(() => {
    const onMenu = () => setMenuOpen(true);
    window.addEventListener('bs:menu', onMenu);
    return () => window.removeEventListener('bs:menu', onMenu);
  }, []);

  // Settings -> document + audio
  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.locale;
    root.dataset['motion'] = settings.reducedMotion ? 'reduced' : 'full';
    root.dataset['contrast'] = settings.highContrast ? 'high' : 'normal';
    configureAudio({ sfx: settings.sfxVolume, music: settings.musicVolume, muted: settings.muted });
  }, [settings]);

  // Audio may only start after a user gesture; M toggles mute.
  useEffect(() => {
    const unlock = () => unlockAudio();
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !(e.target instanceof HTMLInputElement)) {
        const s = useStore.getState();
        s.setSettings({ muted: !s.settings.muted });
      }
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  // ?qa=briefing jumps to the mission briefing screen (used by the end-to-end test, which cannot walk the station).
  useEffect(() => {
    if (!loaded) return;
    if (new URLSearchParams(window.location.search).get('qa') === 'briefing') {
      const st = useStore.getState();
      st.startMission();
      st.goPhase('briefing');
      st.setHub(false);
      setMenuOpen(false);
    }
  }, [loaded]);

  // ?demo=1 opens the Judge Demo directly.
  useEffect(() => {
    if (!loaded) return;
    if (new URLSearchParams(window.location.search).get('demo') === '1' && !useStore.getState().progress) {
      useStore.getState().startDemo();
      setMenuOpen(false);
    }
  }, [loaded]);

  if (!loaded) {
    return <div className="flex h-full items-center justify-center font-pixel text-cyan">LOADING…</div>;
  }
  const showMenu = menuOpen || !progress;
  return (
    <>
      <PhaserHost menuOpen={showMenu} />
      {showMenu ? <MenuScreen onClose={() => { const ph = useStore.getState().progress?.phase; useStore.getState().setHub(!!ph && wantsStation(ph)); setMenuOpen(false); }} /> : <PhaseScreen />}
      <Modals />
      <Toasts />
    </>
  );
}
