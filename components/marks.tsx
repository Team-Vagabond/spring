'use client';
import { CSSProperties } from 'react';

/* A spring on a topographic map: contour rings closing on a source point. */
export function SpringMark({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden>
      <path d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5S16.7 20.5 12 20.5 3.5 16.7 3.5 12 7.3 3.5 12 3.5Z" stroke="currentColor" strokeWidth="1.1" opacity="0.4" />
      <path d="M12 6.6c3 0 5.4 2.4 5.4 5.4S15 17.4 12 17.4 6.6 15 6.6 12 9 6.6 12 6.6Z" stroke="currentColor" strokeWidth="1.2" opacity="0.75" />
      <path d="M12 9.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z" fill="currentColor" />
    </svg>
  );
}

/* A section divider drawn like a survey rule. */
export function ContourDivider({ label, tone: _t }: { label?: string; tone?: string }) {
  return (
    <div className="flex items-center gap-3 select-none">
      {label && <span className="label shrink-0 text-[var(--contour)]">{label}</span>}
      <span className="flex-1 border-t border-[var(--rule-2)]" />
    </div>
  );
}

/* faint contour backdrop */
export function ContourField({ className = '', lines = 5 }: { className?: string; lines?: number; animate?: boolean }) {
  const paths = Array.from({ length: lines }, (_, i) => {
    const y = 24 + i * (150 / lines);
    const amp = 7 + (i % 3) * 6;
    return `M-20 ${y} C 140 ${y - amp}, 300 ${y + amp}, 480 ${y - amp / 2} S 760 ${y + amp}, 960 ${y - amp}`;
  });
  return (
    <svg viewBox="0 0 900 190" preserveAspectRatio="none" className={className} aria-hidden>
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1" />)}
    </svg>
  );
}

/* A recession curve that keeps re-drawing — a spring draining. */
export function RecessionLoader({ className = '', label }: { className?: string; label?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <svg viewBox="0 0 120 60" className="w-36" aria-hidden>
        <path d="M4 8 C 34 8, 40 46, 116 52" fill="none" stroke="var(--rule-2)" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M4 8 C 34 8, 40 46, 116 52" fill="none" stroke="var(--water)" strokeWidth="2" strokeLinecap="round"
          strokeDasharray="180" strokeDashoffset="180"
          style={{ animation: 'draw 1.6s var(--ease) infinite alternate' }}
        />
      </svg>
      {label && <span className="label">{label}</span>}
    </div>
  );
}
