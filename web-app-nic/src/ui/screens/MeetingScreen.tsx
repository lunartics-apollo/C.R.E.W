// Scene 2 · After the call. The team talks at the Mess Hall meeting table (top-down, on the Godot station map),
// then the crew head to their stations. The walking and seating happen in the Phaser StationScene.
import { useState } from 'react';
import { bridge } from '../../game/bridge';
import { useStore, useT } from '../../state/store';
import { CButton } from '../components/Controls';
import { CrewDialogue, type Who } from '../components/CrewDialogue';

// Director Jabu leads the meeting. Speaker order follows the approved script.
const SPEAKERS: readonly Who[] = ['jabu', 'aisyah', 'siti', 'ling', 'jabu', 'aisyah', 'siti', 'ling'];

export function MeetingScreen() {
  const t = useT();
  const goPhase = useStore((s) => s.goPhase);
  const [finished, setFinished] = useState(false);
  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-end p-3">
      <div className="pointer-events-auto mx-auto w-full max-w-3xl">
        {finished ? (
          <div className="panel rise-in flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-sm text-muted">{t('meet.hint')}</span>
            <CButton variant="primary" size="lg" onClick={() => goPhase('briefing')} autoFocus>
              {t('common.continue')} ▸
            </CButton>
          </div>
        ) : (
          <CrewDialogue
            keyPrefix="meet."
            speakers={SPEAKERS}
            onFinish={() => {
              setFinished(true);
              bridge.emit('meetingEnd', undefined); // everyone leaves the table for their station
            }}
          />
        )}
      </div>
    </div>
  );
}
