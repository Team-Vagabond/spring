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
        if (e.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return { ref, inView };
}

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- LazyMount
   Renders children only once the placeholder scrolls near the viewport. Keeps
   heavy widgets (maps) out of the initial render. */
export function LazyMount({
  children,
  placeholder,
  minHeight = 420,
  rootMargin = '400px',
}: {
  children: ReactNode;
  placeholder?: ReactNode;
  minHeight?: number;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setShow(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return (
    <div ref={ref} style={show ? undefined : { minHeight }}>
      {show ? children : placeholder}
    </div>
  );
}

/* ---------------------------------------------------------------- Reveal */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? 'none' : 'translateY(10px)',
        transition: `opacity 0.6s var(--ease) ${delay}s, transform 0.6s var(--ease) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- CountUp */
export function CountUp({
  to,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  duration = 900,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  void duration;
  const shown = Number.isFinite(to) ? to : 0;
  return (
    <span className={`tnum ${className}`}>
      {prefix}
      {shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/* ---------------------------------------------------------------- Chip */
const CHIP: Record<string, string> = {
  water: 'text-[var(--water-bright)] border-[var(--water-a40)] bg-[var(--water-a12)]',
  moss: 'text-[#c2d98a] border-[var(--moss-a40)] bg-[var(--moss-a12)]',
  ochre: 'text-[#e6b483] border-[var(--ochre-a40)] bg-[var(--ochre-a12)]',
  clay: 'text-[var(--clay-bright)] border-[var(--clay-a40)] bg-[var(--clay-a12)]',
  neutral: 'text-[var(--text-2)] border-[var(--hairline-2)] bg-white/[0.03]',
  paper: 'text-[var(--paper-ink-2)] border-[var(--paper-line)] bg-[var(--paper-3)]',
};

export function Chip({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: {
  children: ReactNode;
  tone?: keyof typeof CHIP;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[0.7rem] font-medium tracking-wide ${CHIP[tone]} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Meter */
export function Meter({
  value,
  mode = 'fill',
  max = 1,
  tone = 'water',
  className = '',
}: {
  value: number;
  mode?: 'fill' | 'signed';
  max?: number;
  tone?: 'water' | 'moss' | 'ochre' | 'clay';
  className?: string;
}) {
  const color = `var(--${tone})`;
  const { ref, inView } = useInView<HTMLDivElement>();

  if (mode === 'signed') {
    const frac = Math.max(-1, Math.min(1, value / max));
    const w = Math.abs(frac) * 50;
    const left = frac < 0 ? 50 - w : 50;
    return (
      <div ref={ref} className={`relative h-1.5 rounded-full bg-white/[0.05] overflow-hidden ${className}`}>
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--hairline-2)]" />
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            background: color,
            left: `${left}%`,
            width: inView ? `${w}%` : 0,
            transition: 'width 0.8s var(--ease) 0.15s',
          }}
        />
      </div>
    );
  }

  const frac = Math.max(0, Math.min(1, value / max));
  return (
    <div ref={ref} className={`relative h-1.5 rounded-full bg-white/[0.05] overflow-hidden ${className}`}>
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ background: color, width: inView ? `${frac * 100}%` : 0, transition: 'width 0.8s var(--ease) 0.15s' }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Ledger */
export function Ledger({ rows, className = '' }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={`font-mono text-[0.8rem] ${className}`}>
      {rows.map(([k, v], i) => (
        <div
          key={i}
          className="flex items-baseline justify-between gap-4 py-1.5 border-b border-dashed border-[var(--hairline)] last:border-0"
        >
          <dt className="text-[var(--text-3)] shrink-0">{k}</dt>
          <dd className="text-right tnum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------------- Sparkline */
export function Sparkline({
  data,
  className = '',
  width = 96,
  height = 26,
  stroke = 'currentColor',
}: {
  data: number[];
  className?: string;
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={pts[pts.length - 1].split(',')[1]} r="1.8" fill={stroke} />
    </svg>
  );
}

/* ---------------------------------------------------------------- Button */
export function Button({
  children,
  onClick,
  href,
  disabled,
  variant = 'ghost',
  size = 'md',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'quiet' | 'paper';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]';
  const sizes = { sm: 'px-3 py-1.5 text-[0.8rem]', md: 'px-4 py-2 text-[0.85rem]' };
  const variants = {
    primary:
      'bg-[var(--water)] text-[#04100f] hover:bg-[var(--water-bright)] shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_8px_24px_-8px_var(--water-deep)]',
    ghost: 'border border-[var(--hairline-2)] text-[var(--text)] hover:border-[var(--water-a55)] hover:bg-white/[0.03]',
    quiet: 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-white/[0.04]',
    paper: 'border border-[var(--paper-line)] text-[var(--paper-ink)] hover:bg-[var(--paper-3)]',
  };
  const cls = `${base} ${sizes[size]} ${variants[variant]} ${className}`;
  if (href) return <a href={href} className={cls}>{children}</a>;
  return (
    <button onClick={onClick} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- tone helpers */
export function kindTone(kind: string): keyof typeof CHIP {
  return (
    { declining: 'clay', irregular: 'ochre', recovering: 'moss', stable: 'neutral', inactive: 'neutral' } as const
  )[kind as 'declining'] ?? 'neutral';
}
export function confTone(c: string): 'moss' | 'ochre' | 'neutral' {
  return c === 'High' ? 'moss' : c === 'Moderate' ? 'ochre' : 'neutral';
}
