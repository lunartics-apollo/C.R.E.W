// Shared HUD pieces: top bar, finding list with remedies, modal frame, toasts, concept-card button.
import { useEffect, type ReactNode } from 'react';
import { findingText, remedyText } from '../../i18n';
import { sourceById } from '../../simulation/sources';
import type { Finding } from '../../simulation/types';
import { budgetFor, useStore, useT, wantsStation } from '../../state/store';
import { CButton, StatusChip } from './Controls';
import { play } from '../../audio/sfx';

export function FindingList({ findings, showPass = false, compact = false }: { findings: readonly Finding[]; showPass?: boolean; compact?: boolean }) {
  const locale = useStore((s) => s.settings.locale);
  const mode = useStore((s) => s.progress?.choices.mode ?? 'guided');
  const t = useT();
  const list = findings.filter((f) => showPass || f.severity !== 'pass');
  if (!list.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {list.map((f, i) => {
        const src = sourceById(f.sourceId);
        const remedy = remedyText(locale, f.remedy);
        return (
          <li key={`${f.code}-${i}`} className={`border-l-2 pl-2 ${f.severity === 'fail' ? 'border-red' : f.severity === 'warning' ? 'border-amber' : 'border-green'}`}>
            <div className="flex items-start gap-2">
              <StatusChip status={f.severity} label="" />
              <span className={compact ? 'text-xs' : 'text-sm'}>{findingText(locale, f)}</span>
            </div>
            {remedy && f.severity !== 'pass' && (mode === 'guided' || f.severity === 'fail') && (
              <div className="mt-0.5 pl-7 text-xs text-cyan">
                <span className="font-bold">{t('common.remedy')}:</span> {remedy}
              </div>
            )}
            {src && !compact && <div className="pl-7 text-[0.7rem] text-dim">{src.location}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`panel print-area rise-in flex max-h-[90vh] w-full flex-col p-4 ${wide ? 'max-w-4xl' : 'max-w-xl'}`}>
        <header className="mb-3 flex items-center justify-between gap-3 pl-3">
          <h2 className="font-pixel text-lg text-cyan">{title}</h2>
          <CButton size="sm" variant="ghost" onClick={onClose} className="no-print" aria-label="Close">
            ✕
          </CButton>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}

export function TopBar({ phaseKey, right }: { phaseKey: string; right?: ReactNode }) {
  const t = useT();
  const p = useStore((s) => s.progress);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const openModal = useStore((s) => s.openModal);
  const b = p ? budgetFor(p) : null;
  return (
    <header className="pointer-events-auto flex flex-wrap items-center gap-2 px-3 py-2 no-print" style={{ background: 'linear-gradient(180deg, rgba(4,7,15,0.92), rgba(4,7,15,0.55))', borderBottom: '1px solid var(--line)' }}>
      <CButton size="sm" variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent('bs:menu'))}>
        ☰ {t('common.menu')}
      </CButton>
      {p && wantsStation(p.phase) && (
        <CButton size="sm" variant="ghost" onClick={() => useStore.getState().setHub(true)} title={t('hub.walk')}>
          ⌂ {t('hub.title')}
        </CButton>
      )}
      <h1 className="font-pixel text-sm text-cyan sm:text-base">{t(phaseKey)}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {right}
        {b && (
          <div className="flex items-center gap-2 border border-line px-2 py-1 text-xs" title={t('budget.title')}>
            <span className="engraved">{t('budget.reserve')}</span>
            <span className={`num ${b.reserve < 0 ? 'text-red' : b.reserveFraction < 0.1 ? 'text-amber' : 'text-green'}`}>
              {b.reserve} {t('common.cr')} ({Math.round(b.reserveFraction * 100)}%)
            </span>
          </div>
        )}
        <CButton size="sm" variant="ghost" onClick={() => setSettings({ locale: settings.locale === 'en' ? 'ms' : 'en' })} aria-label={t('settings.language')}>
          {settings.locale === 'en' ? 'BM' : 'EN'}
        </CButton>
        <CButton size="sm" variant="ghost" onClick={() => setSettings({ muted: !settings.muted })} aria-label={t('settings.mute')} aria-pressed={settings.muted}>
          {settings.muted ? '🔇' : '🔊'}
        </CButton>
        <CButton size="sm" variant="ghost" onClick={() => openModal({ kind: 'settings' })} aria-label={t('menu.settings')}>
          ⚙
        </CButton>
      </div>
    </header>
  );
}

export function LearnButton({ id }: { id: string }) {
  const t = useT();
  const openModal = useStore((s) => s.openModal);
  return (
    <button type="button" className="chip chip-info cursor-pointer self-start" onClick={() => { play('click'); openModal({ kind: 'learn', id }); }} aria-label={`${t('common.learn')}: ${t(`concept.${id}`)}`}>
      ⓘ {t(`concept.${id}`)}
    </button>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  useEffect(() => {
    if (!toasts.length) return;
    const first = toasts[0]!;
    const id = setTimeout(() => dismiss(first.id), 3800);
    return () => clearTimeout(id);
  }, [toasts, dismiss]);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={`panel rise-in px-4 py-2 text-sm ${x.tone === 'good' ? 'text-yellow' : x.tone === 'bad' ? 'text-red' : x.tone === 'warn' ? 'text-amber' : 'text-ink'}`}>
          {x.text}
        </div>
      ))}
    </div>
  );
}

export function fmtClock(day: number, hh: number, mm: number, dayLabel: string) {
  return `${dayLabel} ${day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
