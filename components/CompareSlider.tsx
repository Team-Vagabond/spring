'use client';
import { useRef, useState, useCallback } from 'react';

/* Before / after wipe. `before` sits under, `after` is revealed from the left as you drag. */
export function CompareSlider({
  before,
  after,
  beforeLabel,
  afterLabel,
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(50);
  const dragging = useRef(false);

  const move = useCallback((clientX: number) => {
    const el = wrap.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  }, []);

  return (
    <div
      ref={wrap}
      className="group relative w-full aspect-[4/3] overflow-hidden rounded-xl border border-[var(--hairline-2)] select-none cursor-ew-resize bg-[var(--paper-2)]"
      onMouseDown={(e) => { dragging.current = true; move(e.clientX); }}
      onMouseMove={(e) => dragging.current && move(e.clientX)}
      onMouseUp={() => (dragging.current = false)}
      onMouseLeave={() => (dragging.current = false)}
      onTouchStart={(e) => move(e.touches[0].clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      {/* after — full frame */}
      <img src={after} alt={afterLabel ?? 'recent'} className="absolute inset-0 w-full h-full object-cover" draggable={false} />
      {afterLabel && (
        <span className="absolute top-2.5 right-2.5 z-10 font-mono text-[0.62rem] tracking-wide px-2 py-1 rounded bg-black/55 text-white/90 backdrop-blur-sm">
          {afterLabel}
        </span>
      )}

      {/* before — same frame, masked to the left of the handle */}
      <img
        src={before}
        alt={beforeLabel ?? 'past'}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
      />
      {beforeLabel && (
        <span
          className="absolute top-2.5 left-2.5 z-10 font-mono text-[0.62rem] tracking-wide px-2 py-1 rounded bg-black/55 text-white/90 backdrop-blur-sm"
          style={{ opacity: pos > 14 ? 1 : 0, transition: 'opacity .2s' }}
        >
          {beforeLabel}
        </span>
      )}

      {/* handle */}
      <div className="absolute top-0 bottom-0 z-10 pointer-events-none" style={{ left: `${pos}%` }}>
        <div className="absolute inset-y-0 -translate-x-1/2 w-px bg-[var(--water-bright)] shadow-[0_0_12px_var(--water)]" />
        <div className="absolute top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[var(--ink-a80)] border border-[var(--water-bright)] backdrop-blur-sm grid place-items-center transition-transform group-hover:scale-110">
          <svg width="16" height="10" viewBox="0 0 16 10" className="text-[var(--water-bright)]" aria-hidden>
            <path d="M5.5 1 1.5 5l4 4M10.5 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
