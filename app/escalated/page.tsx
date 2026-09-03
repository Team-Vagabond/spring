'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmt } from '@/lib/api';
import { Badge, Panel } from '@/components/ui';

export default function EscalatedList() {
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setItems((await api('/api/escalations')).escalations);
    setLoaded(true);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Escalated springs</h1>
        <p className="text-sm text-[var(--muted)]">
          Springs the agent flagged for a sustained decline. Each one gets a deep analysis:
          then-vs-now satellite comparison of its recharge area, a topographic estimate of where its
          water comes from, and live rainfall — then a ranked, uncertainty-aware explanation.
        </p>
      </div>

      {loaded && items.length === 0 && (
        <Panel><div className="text-sm text-[var(--muted)]">Nothing escalated yet. Run a monitoring scan on the Signals page.</div></Panel>
      )}

      <div className="space-y-3">
        {items.map((e) => (
          <Link key={e.id} href={`/escalated/${e.id}`}>
            <Panel className="hover:border-sky-500/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-medium">{e.sensor?.name ?? e.sensor_id} <span className="text-xs text-[var(--muted)] mono">{e.sensor_id}</span></div>
                  <div className="text-xs text-[var(--muted)]">{e.sensor?.village} · escalated {fmt.date(e.created_at)}</div>
                </div>
                <Badge tone={e.status === 'complete' ? 'green' : e.status === 'error' ? 'red' : 'amber'}>
                  {e.status === 'analyzing' ? 'analysing…' : e.status}
                </Badge>
              </div>
              {e.status === 'complete' && (
                <div className="mt-2 text-sm">
                  <span className="text-[var(--muted)]">Most likely cause: </span>{e.primary_cause ?? '—'}
                  <div className="mt-1 flex gap-3 text-xs text-[var(--muted)]">
                    <span>rainfall {e.rainfall_anomaly_pct != null ? `${e.rainfall_anomaly_pct > 0 ? '+' : ''}${e.rainfall_anomaly_pct}%` : '—'}</span>
                    <span>NDVI {e.ndvi_change_pct != null ? `${e.ndvi_change_pct > 0 ? '+' : ''}${e.ndvi_change_pct}%` : '—'}</span>
                    <span>built-up {e.builtup_change_pp != null ? `${e.builtup_change_pp > 0 ? '+' : ''}${e.builtup_change_pp}pp` : '—'}</span>
                  </div>
                </div>
              )}
              {e.status === 'error' && <div className="mt-2 text-xs text-rose-300">{e.error}</div>}
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  );
}
