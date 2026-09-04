'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Network' },
  { href: '/signals', label: 'Watch log' },
  { href: '/escalated', label: 'Cases' },
];

/* survey benchmark — a triangle over a point, like a trig station on a map */
function Benchmark() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 3.2 16.5 15H3.5L10 3.2Z" stroke="var(--contour)" strokeWidth="1.3" />
      <circle cx="10" cy="11.6" r="1.7" fill="var(--water)" />
    </svg>
  );
}

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/escalations')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setOpen((d.escalations ?? []).filter((e: { status: string }) => e.status !== 'error' && e.status !== 'rejected').length);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [path]);

  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <header className="fixed top-0 inset-x-0 z-[2000] h-[54px] bg-[var(--paper)] border-b border-[var(--rule-2)]">
      <div className="mx-auto max-w-[1440px] h-full px-4 sm:px-6 flex items-center gap-7">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Benchmark />
          <span className="serif text-[1.35rem] font-medium tracking-tight text-[var(--ink)]">Mul</span>
        </Link>

        <nav className="flex items-stretch h-full">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`h-full flex items-center px-3.5 text-[0.86rem] border-b-2 -mb-px transition-colors ${
                active(n.href)
                  ? 'text-[var(--ink)] font-semibold border-[var(--contour)]'
                  : 'text-[var(--ink-3)] hover:text-[var(--ink-2)] border-transparent'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center">
          {open != null && open > 0 && (
            <Link href="/escalated" className="flex items-center gap-2 text-[0.8rem] text-[var(--ink-2)] hover:text-[var(--ink)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--alert)]" />
              {open} spring{open === 1 ? '' : 's'} under investigation
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
