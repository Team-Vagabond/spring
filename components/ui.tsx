'use client';
import { ReactNode } from 'react';

const TONES: Record<string, string> = {
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  red: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
};

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`panel p-4 ${className}`}>{children}</div>;
}

export function Button({
  children, onClick, disabled, tone = 'default', type = 'button', size = 'md',
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger' | 'ghost'; type?: 'button' | 'submit'; size?: 'sm' | 'md';
}) {
  const tones = {
    default: 'bg-[var(--panel-2)] hover:bg-[#20355a] border-[var(--border)]',
    primary: 'bg-sky-600 hover:bg-sky-500 border-sky-500 text-white',
    danger: 'bg-rose-600/90 hover:bg-rose-500 border-rose-500 text-white',
    ghost: 'bg-transparent hover:bg-[var(--panel-2)] border-transparent',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border ${tones[tone]} ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm'} font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
    >
      {children}
    </button>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="panel p-3">
      <div className="text-xs text-[var(--muted)]">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${tone ?? ''}`}>{value}</div>
      {sub != null && <div className="text-xs text-[var(--muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

export function statusTone(status: string): keyof typeof TONES {
  switch (status) {
    case 'healthy': return 'green';
    case 'anomaly': return 'red';
    case 'sensor_offline': return 'amber';
    case 'under_investigation': return 'violet';
    case 'awaiting_approval': return 'amber';
    case 'approved': case 'effective': case 'strengthened': case 'strongly_supported': return 'green';
    case 'rejected': case 'ineffective': case 'eliminated': return 'red';
    case 'running': return 'blue';
    case 'weakened': case 'strongly_weakened': return 'slate';
    default: return 'slate';
  }
}
