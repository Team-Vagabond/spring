'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SpringMark } from './marks';

const NAV = [
  { href: '/', label: 'Network' },
  { href: '/signals', label: 'Watch log' },
  { href: '/escalated', label: 'Cases' },
];

export function SiteHeader() {
  const path = usePathname();
  const [openCases, setOpenCases] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/escalations')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setOpenCases((d.escalations ?? []).filter((e: { status: string }) => e.status !== 'error').length);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [path]);

  const isActive = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <header className="fixed top-0 inset-x-0 z-[2000] h-[52px] bg-[var(--ink-a92)] backdrop-blur-md border-b border-[var(--hairline)]">
      <div className="mx-auto max-w-[1440px] h-full px-4 sm:px-6 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
          <SpringMark className="w-6 h-6 text-[var(--water)] transition-transform duration-500 group-hover:rotate-[24deg]" />
          <span className="font-display text-[1.35rem] leading-none tracking-tight text-[var(--text)] lowercase">naula</span>
        </Link>

        <nav className="flex items-center gap-1 text-[0.8125rem]">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative px-3 py-1.5 rounded-md transition-colors ${
                  active ? 'text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text-2)]'
                }`}
              >
                {n.label}
                {active && (
                  <span className="absolute left-3 right-3 -bottom-[15px] h-[2px] bg-[var(--water)] origin-left animate-[nav-underline_0.35s_var(--ease)_both]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {openCases != null && openCases > 0 && (
            <Link
              href="/escalated"
              className="flex items-center gap-2 pl-2.5 pr-3 py-1 rounded-full border border-[var(--clay-a40)] bg-[var(--clay-a12)] text-[0.75rem] text-[var(--clay-bright)]"
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex w-full h-full rounded-full bg-[var(--clay-bright)] opacity-60 animate-ping" />
                <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[var(--clay-bright)]" />
              </span>
              {openCases} under investigation
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
