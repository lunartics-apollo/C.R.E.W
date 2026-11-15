// Console-style building blocks: buttons, panels, chips, meters, segmented switches.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { play } from '../../audio/sfx';
import type { Severity } from '../../simulation/types';
import { useT } from '../../state/store';

type Variant = 'default' | 'primary' | 'go' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg' | 'xl';

export function CButton({ variant = 'default', size = 'md', sound = 'click', className = '', onClick, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; sound?: 'click' | 'none' }) {
  const v = variant === 'default' ? '' : `cbtn-${variant}`;
  const s = size === 'md' ? '' : `cbtn-${size}`;
  return (
    <button
      type="button"
      className={`cbtn ${v} ${s} ${className}`}
      onClick={(e) => {
        if (sound === 'click') play('click');
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Panel({ title, children, className = '', right }: { title?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`panel p-3 ${className}`}>
      {(title || right) && (
        <header className="mb-2 flex items-center justify-between gap-2 pl-3">
          {title && <h2 className="panel-title">{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

const ICON: Record<Severity | 'info', string> = { pass: '✔', warning: '▲', fail: '✖', info: '●' };

export function StatusChip({ status, label }: { status: Severity | 'info'; label?: string }) {
  const t = useT();
  const text = label ?? (status === 'pass' ? t('common.pass') : status === 'warning' ? t('common.warning') : status === 'fail' ? t('common.fail') : '');
  return (
    <span className={`chip chip-${status}`}>
      <span aria-hidden="true">{ICON[status]}</span>
      {text}
    </span>
  );
}

export function Meter({ value, max, color, marker, label }: { value: number; max: number; color?: string; marker?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1e-9, max)) * 100));
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value * 100) / 100} aria-label={label}>
      <span style={{ width: `${pct}%`, ['--mc' as string]: color ?? 'var(--cyan)' }} />
      {marker !== undefined && <i style={{ left: `${Math.max(0, Math.min(100, (marker / max) * 100))}%` }} />}
    </div>
  );
}

export function Switch<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="switch" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => {
            play('click');
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: Severity | 'info' }) {
  const color = tone === 'fail' ? 'text-red' : tone === 'warning' ? 'text-amber' : tone === 'pass' ? 'text-green' : 'text-ink';
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`num ${color}`}>
        {tone === 'fail' && <span aria-hidden="true">✖ </span>}
        {tone === 'warning' && <span aria-hidden="true">▲ </span>}
        {value}
        {unit && <span className="ml-1 text-xs text-dim">{unit}</span>}
      </span>
    </div>
  );
}
