'use client';
import { CSSProperties } from 'react';

/* A spring as it appears on a topographic map: contour rings closing on a source point. */
export function SpringMark({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} style={style} aria-hidden>
      <path d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5S16.7 20.5 12 20.5 3.5 16.7 3.5 12 7.3 3.5 12 3.5Z"
        stroke="currentColor" strokeWidth="1.1" opacity="0.4" />
      <path d="M12 6.6c3 0 5.4 2.4 5.4 5.4S15 17.4 12 17.4 6.6 15 6.6 12 9 6.6 12 6.6Z"
        stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      <path d="M12 9.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z" fill="currentColor" />
    </svg>
  );
}

/* Ambient topographic contours — a quiet backdrop. */
export function ContourField({
  className = '',
  animate = false,
  lines = 6,
}: {
  className?: string;
  animate?: boolean;
  lines?: number;
}) {
  const paths = Array.from({ length: lines }, (_, i) => {
    const y = 20 + i * (160 / lines);
    const amp = 8 + (i % 3) * 6;
    return `M-20 ${y} C 120 ${y - amp}, 260 ${y + amp}, 420 ${y - amp / 2} S 720 ${y + amp}, 940 ${y - amp}`;
  });
  return (
    <svg
      viewBox="0 0 900 200"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          style={
            animate
              ? {
                  strokeDasharray: 1400,
                  strokeDashoffset: 1400,
                  animation: `contour-draw 1.6s var(--ease) forwards`,
                  animationDelay: `${i * 90}ms`,
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}

/* Section divider: a contour rule that steps around a marker. */
export function ContourDivider({ label, tone = 'ink' }: { label?: string; tone?: 'ink' | 'paper' }) {
  const stroke = tone === 'paper' ? 'var(--paper-line)' : 'var(--hairline-2)';
  const text = tone === 'paper' ? 'var(--paper-ink-3)' : 'var(--text-3)';
  return (
    <div className="flex items-center gap-3 my-1 select-none">
      {label && (
        <span className="eyebrow shrink-0" style={{ color: text }}>
          {label}
        </span>
      )}
      <svg viewBox="0 0 600 12" preserveAspectRatio="none" className="flex-1 h-3" aria-hidden>
        <path d="M0 8 H120 C150 8 150 3 180 3 H600" fill="none" stroke={stroke} strokeWidth="1" />
        <path d="M0 4 H90 C110 4 110 9 130 9 H600" fill="none" stroke={stroke} strokeWidth="1" opacity="0.45" />
      </svg>
    </div>
  );
}

/* A drying spring: an exponential recession curve that keeps drawing itself. */
export function RecessionLoader({ className = '', label }: { className?: string; label?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <svg viewBox="0 0 120 60" className="w-40" aria-hidden>
        <path d="M4 8 C 34 8, 40 46, 116 52" fill="none" stroke="var(--hairline-2)" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M4 8 C 34 8, 40 46, 116 52"
          fill="none"
          stroke="var(--water)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="180"
          strokeDashoffset="180"
          style={{ animation: 'contour-draw 1.7s var(--ease-in-out) infinite alternate' }}
        />
      </svg>
      {label && <span className="eyebrow">{label}</span>}
    </div>
  );
}
