// Mission director "Director Jabu", using the Godot game's Jabu art: a monitor with a blinking, talking portrait,
// expressions and gestures, plus a typed, skippable dialogue box.
import { useEffect, useRef, useState } from 'react';
import { SCRIPT, type Expression, type Gesture, type Line } from '../../narrative/script';
import { play } from '../../audio/sfx';
import { useStore, useT } from '../../state/store';

// Director Jabu, drawn from the Godot game's cast sheet (assets/briefing/cast_jabu.png):
// 4 mouth frames across, 9 expressions down, each cell 96 x 112 with the face at (6, 2, 84, 84).
const CAST_ROW: Record<Expression, number> = { neutral: 0, happy: 3, concerned: 6, surprised: 5, serious: 4 };
const CAST_BLINK_ROW = 1;
// Row 7 (raised finger) is deliberately never used: at this size it can read as a rude gesture.
const CAST_THUMBS_ROW = 3; // smiling

function Portrait({ expr, talking, gesture, size = 112 }: { expr: Expression; talking: boolean; gesture: Gesture; size?: number }) {
  const [blink, setBlink] = useState(false);
  const [mouth, setMouth] = useState(0);
  const reduced = useStore((s) => s.settings.reducedMotion);
  useEffect(() => {
    const id = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
    }, 3200 + Math.random() * 1500);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!talking) {
      setMouth(0);
      return;
    }
    const id = setInterval(() => setMouth(1 + Math.floor(Math.random() * 3)), 120);
    return () => clearInterval(id);
  }, [talking]);
  const row = blink && !talking ? CAST_BLINK_ROW : gesture === 'thumbs' ? CAST_THUMBS_ROW : CAST_ROW[expr];
  const k = size / 84;
  return (
    <div
      role="img"
      aria-label="Director Jabu"
      style={{
        width: size,
        height: size,
        backgroundImage: "url('/ui/cast/jabu.png')",
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${384 * k}px ${1008 * k}px`,
        backgroundPosition: `-${(6 + mouth * 96) * k}px -${(2 + row * 112) * k}px`,
        imageRendering: 'pixelated',
        transform: talking && !reduced ? 'translateY(-1px)' : undefined,
        transition: 'transform 120ms',
      }}
    />
  );
}

function SignalBars({ active }: { active: boolean }) {
  const [lv, setLv] = useState([2, 3, 2, 4, 3]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setLv(lv.map(() => 1 + Math.floor(Math.random() * 5))), 110);
    return () => clearInterval(id);
  }, [active, lv]);
  return (
    <div className="flex items-end gap-[2px]" aria-hidden="true">
      {lv.map((h, i) => (
        <span key={i} style={{ width: 3, height: (active ? h : 1) * 3 + 2, background: active ? 'var(--cyan)' : 'var(--dim)' }} />
      ))}
    </div>
  );
}

/** Monitor with portrait + typed dialogue. Plays `scene` lines from the script; Space/click advances. */
export function Commander({ scene, onDone, compact = false, autoHide = false }: { scene: string; onDone?: () => void; compact?: boolean; autoHide?: boolean }) {
  const t = useT();
  const instant = useStore((s) => s.settings.instantText);
  const lines: readonly Line[] = SCRIPT[scene] ?? [];
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(0);
  const [hidden, setHidden] = useState(false);
  const line = lines[Math.min(idx, lines.length - 1)];
  const full = line ? t(line.key) : '';
  const typing = shown < full.length;
  const doneRef = useRef(false);

  useEffect(() => {
    setIdx(0);
    setShown(0);
    setHidden(false);
    doneRef.current = false;
  }, [scene]);

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
    if (typing) {
      setShown(full.length);
      return;
    }
    if (idx < lines.length - 1) {
      setIdx(idx + 1);
      setShown(0);
      play('beep');
    } else if (!doneRef.current) {
      doneRef.current = true;
      onDone?.();
      if (autoHide) setHidden(true);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!line || hidden) return null;
  const last = idx >= lines.length - 1 && !typing;
  return (
    <div className={`panel flex gap-3 p-3 rise-in ${compact ? 'items-center' : ''}`} role="dialog" aria-label="Director Jabu" aria-live="polite">
      <div className="crt crt-glare flicker relative shrink-0 border border-line" style={{ width: compact ? 76 : 120, height: compact ? 76 : 120 }}>
        <div className="scanbar" />
        <div className="absolute inset-0 flex items-end justify-center">
          <Portrait expr={line.expr} talking={typing} gesture={line.gesture ?? 'none'} size={compact ? 76 : 116} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="engraved">DIR. JABU</span>
          <SignalBars active={typing} />
        </div>
        <p className={`text-[0.95rem] leading-snug ${typing ? 'caret' : ''}`}>{full.slice(0, shown)}</p>
        <div className="mt-auto flex justify-end gap-2 pt-2">
          {!last && (
            <button type="button" className="cbtn cbtn-ghost cbtn-sm" onClick={() => { setIdx(lines.length - 1); setShown(t(lines[lines.length - 1]!.key).length); }}>
              {t('common.skip')}
            </button>
          )}
          <button type="button" className="cbtn cbtn-sm" onClick={advance} autoFocus={!compact}>
            {last ? t('common.continue') : t('common.next')} ▸
          </button>
        </div>
      </div>
    </div>
  );
}
