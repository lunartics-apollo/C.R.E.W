// Scene 2 · After the call. The team talks at the Mess Hall meeting table (top-down, on the Godot station map),
// then the crew head to their stations. The walking and seating happen in the Phaser StationScene.
import { useEffect, useRef, useState } from 'react';
import { bridge } from '../../game/bridge';
import { useStore, useT } from '../../state/store';
import { play } from '../../audio/sfx';
import { CButton } from '../components/Controls';

type Who = 'jabu' | 'aisyah' | 'siti' | 'ling';

// Director Jabu leads the meeting. Speaker order follows the approved script.
const LINES: readonly Who[] = ['jabu', 'aisyah', 'siti', 'ling', 'jabu', 'aisyah', 'siti', 'ling'];
// The crew portraits are the Godot game's: nova = Aisyah, orion = Jabu, juno = Siti, kai = Ling.
const PORTRAIT: Record<Who, string> = { aisyah: 'nova', jabu: 'orion', siti: 'juno', ling: 'kai' };

export function MeetingScreen() {
  const t = useT();
  const goPhase = useStore((s) => s.goPhase);
  const instant = useStore((s) => s.settings.instantText);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [finished, setFinished] = useState(false);
  const endedRef = useRef(false);
  const full = t(`meet.${idx + 1}`);
  const typing = shown < full.length;
  const who = LINES[idx]!;

  useEffect(() => {
    if (instant) {
      setShown(full.length);
      return;
    }
    if (!typing) return;
    const id = setTimeout(() => {
      setShown((s) => Math.min(full.length, s + 2));
      if (shown % 6 === 0) play('type');
    }, 22);
    return () => clearTimeout(id);
  }, [shown, typing, full, instant]);

  const advance = () => {
    if (finished) return;
    if (typing) {
      setShown(full.length);
      return;
    }
    if (idx < LINES.length - 1) {
      setIdx(idx + 1);
      setShown(0);
      play('beep');
    } else if (!endedRef.current) {
      endedRef.current = true;
      setFinished(true);
      bridge.emit('meetingEnd', undefined); // everyone leaves the table for their station
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter' || e.key.toLowerCase() === 'e') && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
          <div className="panel rise-in flex gap-3 p-3" role="dialog" aria-label={t(`meet.who.${who}`)} aria-live="polite">
            <div className="shrink-0 border-2 border-[#1c1622] bg-[#2e3040]" style={{ width: 84, height: 84 }}>
              <img src={`/ui/crew/${PORTRAIT[who]}_portrait.png`} alt="" width={84} height={84} style={{ imageRendering: 'pixelated' }} />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-pixel text-[0.7rem] tracking-widest text-cyan">{t(`meet.who.${who}`)}</span>
              <p className={`mt-1 text-[0.95rem] leading-snug ${typing ? 'caret' : ''}`}>{full.slice(0, shown)}</p>
              <div className="mt-auto flex justify-end pt-2">
                <CButton size="sm" onClick={advance} autoFocus>
                  {t('meet.next')} ▸
                </CButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
