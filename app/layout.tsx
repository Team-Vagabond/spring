import type { Metadata } from 'next';
import Link from 'next/link';
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Spring Sentinel',
  description: 'Autonomous spring monitoring & investigation — Darchula, Nepal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-[var(--border)] bg-[var(--panel)]">
          <div className="mx-auto max-w-6xl px-5 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-[var(--accent)]">◈</span> Spring Sentinel
            </Link>
            <nav className="flex gap-5 text-sm text-[var(--muted)]">
              <Link href="/" className="hover:text-[var(--text)]">Map</Link>
              <Link href="/signals" className="hover:text-[var(--text)]">Signals</Link>
              <Link href="/escalated" className="hover:text-[var(--text)]">Escalated springs</Link>
            </nav>
            <span className="ml-auto text-[11px] text-[var(--muted)] hidden sm:block">
              flow readings simulated · rainfall &amp; satellite live
            </span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
