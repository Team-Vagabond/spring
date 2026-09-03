'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Reveal, Chip, CountUp, Button } from '@/components/ui';
import { ContourField, RecessionLoader } from '@/components/marks';

const fdate = (s?: string) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function CasesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setItems((await api('/api/escalations')).escalations);
    setLoaded(true);
  }, []);
  const analyzing = items.some((e) => e.status === 'analyzing');
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [analyzing, load]);

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-12">
      <header className="relative">
        <ContourField className="absolute -top-4 -left-6 right-0 h-32 text-[var(--water)] opacity-[0.06] pointer-events-none" />
        <div className="relative">
          <div className="eyebrow">Open cases</div>
          <h1 className="display-xl mt-2">Springs under investigation</h1>
          <p className="measure mt-4 text-[0.95rem] leading-relaxed text-[var(--text-2)]">
            Each spring the agent escalated for a sustained decline. Every case is worked the same
            way — the source area traced from terrain, the recharge area compared then and now by
            satellite, and 25 years of rainfall — ending in a ranked, uncertainty-aware finding.
          </p>
        </div>
      </header>

      <div className="mt-10 space-y-4">
        {!loaded && <div className="py-16"><RecessionLoader label="loading cases" /></div>}

        {loaded && items.length === 0 && (
          <div className="text-center py-20 border border-dashed border-[var(--hairline-2)] rounded-2xl">
            <p className="display-m text-[var(--text-2)]">No springs under investigation.</p>
            <p className="text-[0.85rem] text-[var(--text-3)] mt-2">The watch log is quiet.</p>
            <Button variant="ghost" href="/signals" className="mt-6">Run a monitoring scan</Button>
          </div>
        )}

        {items.map((e, i) => (
          <Reveal key={e.id} delay={i * 0.05}>
            <Link href={`/escalated/${e.id}`} className="block group">
              <article className="relative overflow-hidden card px-5 sm:px-7 py-6 transition-all duration-300 group-hover:border-[var(--water-a40)] group-hover:-translate-y-0.5">
                {e.status === 'analyzing' && <div className="scan-line" />}
                <div className="relative flex items-start justify-between gap-6 flex-wrap">
                  <div>
                    <h2 className="display-m text-[var(--text)]">{e.sensor?.name ?? e.sensor_id}</h2>
                    <p className="font-mono text-[0.75rem] text-[var(--text-3)] mt-1">
                      {e.sensor_id} · {e.sensor?.village} · opened {fdate(e.created_at)}
                    </p>
                  </div>
                  <Chip tone={e.status === 'complete' ? 'moss' : e.status === 'error' ? 'clay' : 'water'} dot>
                    {e.status === 'analyzing' ? 'analysing' : e.status}
                  </Chip>
                </div>

                {e.status === 'complete' && (
                  <div className="relative mt-5 grid sm:grid-cols-[1.4fr_1fr] gap-x-8 gap-y-4">
                    <div>
                      <div className="eyebrow">Most likely cause</div>
                      <p className="text-[0.95rem] text-[var(--text)] mt-1 leading-snug">{e.primary_cause ?? '—'}</p>
                    </div>
                    <div className="flex gap-5">
                      <MiniStat label="rainfall" value={e.rainfall_anomaly_pct} unit="%" />
                      <MiniStat label="NDVI" value={e.ndvi_change_pct} unit="%" />
                      <MiniStat label="built-up" value={e.builtup_change_pp} unit="pp" />
                    </div>
                  </div>
                )}
                {e.status === 'analyzing' && (
                  <p className="relative mt-4 text-[0.83rem] text-[var(--water-bright)]">
                    Fetching satellite imagery, tracing the catchment, reading rainfall…
                  </p>
                )}
                {e.status === 'error' && (
                  <p className="relative mt-4 text-[0.83rem] text-[var(--clay-bright)]">{e.error}</p>
                )}
              </article>
            </Link>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  const bad = value != null && ((unit === '%' && label !== 'built-up' && value < -5) || (label === 'built-up' && value > 2) || (label === 'rainfall' && value < -10));
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className={`font-mono text-[0.9rem] tnum mt-0.5 ${bad ? 'text-[var(--clay-bright)]' : 'text-[var(--text-2)]'}`}>
        {value == null ? '—' : <><CountUp to={value} decimals={1} prefix={value > 0 ? '+' : ''} />{unit}</>}
      </div>
    </div>
  );
}
