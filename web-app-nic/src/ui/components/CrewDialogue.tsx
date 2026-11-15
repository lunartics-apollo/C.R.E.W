// A short crew conversation: the speaker's Godot portrait, name and typed text. Space / Enter / E or the button advance.
import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../../state/store';
import { play } from '../../audio/sfx';
import { CButton } from './Controls';

export type Who = 'jabu' | 'aisyah' | 'siti' | 'ling';

// The crew portraits are the Godot game's: nova = Aisyah, orion = Jabu, juno = Siti, kai = Ling.
const PORTRAIT: Record<Who, string> = { aisyah: 'nova', jabu: 'orion', siti: 'juno', ling: 'kai' };

/** `keyPrefix` + 1..n are the i18n keys of the lines; `speakers[i]` says who speaks line i. */
export function CrewDialogue({ keyPrefix, speakers, onFinish }: { keyPrefix: string; speakers: readonly Who[]; onFinish: () => void }) {
  const t = useT();
  const instant = useStore((s) => s.settings.instantText);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const finishedRef = useRef(false);
  const full = t(`${keyPrefix}${idx + 1}`);
  const typing = shown < full.length;
  const who = speakers[idx]!;

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
    if (finishedRef.current) return;
    if (typing) {
      setShown(full.length);
      return;
    }
    if (idx < speakers.length - 1) {
      setIdx(idx + 1);
      setShown(0);
      play('beep');
    } else {
      finishedRef.current = true;
      onFinish();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'Space' || e.code === 'Enter' || e.key.toLowerCase() === 'e') && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        e.stopPropagation();
        advance();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
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
  );
}
