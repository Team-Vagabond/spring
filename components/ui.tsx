'use client';
import { ReactNode, useEffect, useRef, useState } from 'react';

/* ---------------------------------------------------------------- useInView */
function useInView<T extends Element>(once = true) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') return setInView(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { setInView(true); if (once) io.disconnect(); }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.04 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return { ref, inView };
}

/* ---------------------------------------------------------------- Reveal */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{ opacity: inView ? 1 : 0, transition: `opacity .5s var(--ease) ${delay}s` }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- LazyMount */
export function LazyMount({
  children, placeholder, minHeight = 420, rootMargin = '400px',
}: { children: ReactNode; placeholder?: ReactNode; minHeight?: number; rootMargin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setShow(true);
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShow(true); io.disconnect(); } }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return <div ref={ref} style={show ? undefined : { minHeight }}>{show ? children : placeholder}</div>;
}

/* ---------------------------------------------------------------- CountUp (plain, no animation) */
export function CountUp({
  to, decimals = 0, prefix = '', suffix = '', className = '',
}: { to: number; decimals?: number; prefix?: string; suffix?: string; className?: string; duration?: number }) {
  const v = Number.isFinite(to) ? to : 0;
  return (
    <span className={`tnum ${className}`}>
      {prefix}{v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
}

/* ---------------------------------------------------------------- Chip — a squared tag */
const CHIP: Record<string, string> = {
  water: 'text-[var(--water-2)] border-[var(--water)] bg-[var(--water-wash)]',
  field: 'text-[var(--field)] border-[var(--field)] bg-[var(--field-wash)]',
  watch: 'text-[var(--watch)] border-[var(--watch)] bg-[var(--watch-wash)]',
  alert: 'text-[var(--alert)] border-[var(--alert)] bg-[var(--alert-wash)]',
  neutral: 'text-[var(--ink-2)] border-[var(--rule-2)] bg-[var(--paper-2)]',
  // legacy aliases used across pages
  moss: 'text-[var(--field)] border-[var(--field)] bg-[var(--field-wash)]',
  ochre: 'text-[var(--watch)] border-[var(--watch)] bg-[var(--watch-wash)]',
  clay: 'text-[var(--alert)] border-[var(--alert)] bg-[var(--alert-wash)]',
  paper: 'text-[var(--ink-2)] border-[var(--rule-2)] bg-[var(--paper-2)]',
};

export function Chip({
  children, tone = 'neutral', dot = false, className = '',
}: { children: ReactNode; tone?: keyof typeof CHIP; dot?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 border px-1.5 py-[1px] text-[0.7rem] font-medium ${CHIP[tone] ?? CHIP.neutral} ${className}`}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Meter */
export function Meter({
  value, mode = 'fill', max = 1, tone = 'water', className = '',
}: { value: number; mode?: 'fill' | 'signed'; max?: number; tone?: 'water' | 'field' | 'watch' | 'alert' | 'moss' | 'ochre' | 'clay'; className?: string }) {
  const map: Record<string, string> = { water: 'var(--water)', field: 'var(--field)', watch: 'var(--watch)', alert: 'var(--alert)', moss: 'var(--field)', ochre: 'var(--watch)', clay: 'var(--alert)' };
  const color = map[tone] ?? 'var(--water)';
  const { ref, inView } = useInView<HTMLDivElement>();

  if (mode === 'signed') {
    const frac = Math.max(-1, Math.min(1, value / max));
    const w = Math.abs(frac) * 50;
    const left = frac < 0 ? 50 - w : 50;
    return (
      <div ref={ref} className={`relative h-[5px] bg-[var(--paper-3)] overflow-hidden ${className}`}>
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--rule-2)]" />
        <div className="absolute top-0 bottom-0" style={{ background: color, left: `${left}%`, width: inView ? `${w}%` : 0, transition: 'width .7s var(--ease) .1s' }} />
      </div>
    );
  }
  const frac = Math.max(0, Math.min(1, value / max));
  return (
    <div ref={ref} className={`relative h-[5px] bg-[var(--paper-3)] overflow-hidden ${className}`}>
      <div className="absolute inset-y-0 left-0" style={{ background: color, width: inView ? `${frac * 100}%` : 0, transition: 'width .7s var(--ease) .1s' }} />
    </div>
  );
}

/* ---------------------------------------------------------------- Ledger */
export function Ledger({ rows, className = '' }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={`font-mono text-[0.8rem] ${className}`}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-1.5 border-b border-dotted border-[var(--rule-2)] last:border-0">
          <dt className="text-[var(--ink-3)] shrink-0">{k}</dt>
          <dd className="text-right tnum text-[var(--ink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------- Sparkline */
export function Sparkline({
  data, className = '', width = 96, height = 26, stroke = 'currentColor',
}: { data: number[]; className?: string; width?: number; height?: number; stroke?: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={pts[pts.length - 1].split(',')[1]} r="1.7" fill={stroke} />
    </svg>
  );
}

/* ---------------------------------------------------------------- Button */
export function Button({
  children, onClick, href, disabled, variant = 'secondary', size = 'md', className = '',
}: {
  children: ReactNode; onClick?: () => void; href?: string; disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'ghost' | 'paper'; size?: 'sm' | 'md'; className?: string;
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed border';
  const sizes = { sm: 'px-2.5 py-1 text-[0.78rem]', md: 'px-3.5 py-1.5 text-[0.83rem]' };
  const variants: Record<string, string> = {
    primary: 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)] hover:bg-[var(--water-2)] hover:border-[var(--water-2)]',
    secondary: 'bg-transparent text-[var(--ink)] border-[var(--ink-2)] hover:bg-[var(--paper-3)]',
    ghost: 'bg-transparent text-[var(--ink)] border-[var(--ink-2)] hover:bg-[var(--paper-3)]',
    paper: 'bg-transparent text-[var(--ink)] border-[var(--rule-2)] hover:bg-[var(--paper-3)]',
    quiet: 'bg-transparent text-[var(--ink-3)] border-transparent hover:text-[var(--ink)] hover:bg-[var(--paper-3)]',
  };
  const cls = `${base} ${sizes[size]} ${variants[variant] ?? variants.secondary} ${className}`;
  if (href) return <a href={href} className={cls}>{children}</a>;
  return <button onClick={onClick} disabled={disabled} className={cls}>{children}</button>;
}

/* ---------------------------------------------------------------- tone helpers */
export function kindTone(kind: string): keyof typeof CHIP {
  return ({ declining: 'alert', irregular: 'watch', recovering: 'field', stable: 'neutral', inactive: 'neutral' } as const)[kind as 'declining'] ?? 'neutral';
}
export function confTone(c: string): 'field' | 'watch' | 'neutral' {
  return c === 'High' ? 'field' : c === 'Moderate' ? 'watch' : 'neutral';
}
