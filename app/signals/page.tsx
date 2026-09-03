'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Reveal, Chip, Button, Sparkline, kindTone } from '@/components/ui';
import { ContourField } from '@/components/marks';

const ftime = (s?: string) =>
  s ? new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const sevColor = (s: string) => (s === 'high' ? 'var(--clay)' : s === 'medium' ? 'var(--ochre)' : 'var(--text-3)');

export default function WatchLog() {
  const [signals, setSignals] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<{ text: string; pct: number } | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    setSignals((await api('/api/signals')).signals);
    loaded.current = true;
  }, []);
  useEffect(() => { load(); }, [load]);

  async function expand(s: any) {
    setOpen(open === s.id ? null : s.id);
    if (!series[s.sensor_id]) {
      try {
        const d = await api(`/api/sensors/${s.sensor_id}`);
        setSeries((p) => ({ ...p, [s.sensor_id]: d.readings.slice(-26).map((r: any) => r.flow_lpm) }));
      } catch { /* ignore */ }
    }
  }

  async function scan() {
    setBusy(true);
    setPhase({ text: 'Reading every sensor against its own seasonal baseline', pct: 12 });
    const r = await api('/api/scan', { method: 'POST' });
    await load();
    const todo = r.escalations.filter((e: any) => !e.reused);
    if (!todo.length) setPhase({ text: 'Scan complete — nothing new to investigate', pct: 100 });
    for (let i = 0; i < todo.length; i++) {
      setPhase({
        text: `Investigating ${i + 1} of ${todo.length}: satellite then-and-now, catchment trace, rainfall`,
        pct: 25 + (i / todo.length) * 70,
      });
      await api(`/api/escalations/${todo[i].id}/analyze`, { method: 'POST' }).catch(() => {});
      await load();
    }
    setPhase({ text: 'Watch cycle complete', pct: 100 });
    setTimeout(() => setPhase(null), 2200);
    setBusy(false);
  }

  const counts = {
    watched: new Set(signals.map((s) => s.sensor_id)).size,
    watching: signals.filter((s) => s.decision === 'watching').length,
    escalated: signals.filter((s) => s.decision === 'escalated').length,
  };

  return (
    <div className="mx-auto max-w-[900px] px-6 py-12">
      <header className="relative">
        <ContourField className="absolute -top-4 -left-6 right-0 h-32 text-[var(--water)] opacity-[0.06] pointer-events-none" />
        <div className="relative flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="eyebrow">Watch log</div>
            <h1 className="display-xl mt-2">What the agent noticed</h1>
            <p className="mt-4 font-mono text-[0.78rem] text-[var(--text-3)]">
              {counts.watched} springs watched
              <span className="mx-2 text-[var(--hairline-2)]">·</span>
              {counts.watching} being watched
              <span className="mx-2 text-[var(--hairline-2)]">·</span>
              <span className={counts.escalated ? 'text-[var(--clay-bright)]' : ''}>{counts.escalated} escalated</span>
            </p>
          </div>
          <Button variant="primary" onClick={scan} disabled={busy}>
            {busy ? 'Watching…' : 'Run watch cycle'}
          </Button>
        </div>
      </header>

      {phase && (
        <div className="card px-4 py-3 mt-6 rise-in">
          <p className="text-[0.83rem] text-[var(--water-bright)]">{phase.text}</p>
          <div className="mt-2 h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
            <div className="h-full bg-[var(--water)] transition-[width] duration-500 ease-in-out" style={{ width: `${phase.pct}%` }} />
          </div>
        </div>
      )}

      {/* timeline */}
      <div className="relative mt-10 pl-8">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gradient-to-b from-[var(--water-a55)] via-[var(--hairline-2)] to-transparent" />
        {loaded.current && signals.length === 0 && !busy && (
          <p className="text-[0.9rem] text-[var(--text-3)] py-8">No readings yet. Run a watch cycle.</p>
        )}

        <div className="space-y-1">
          {signals.map((s, i) => {
            const isOpen = open === s.id;
            return (
              <Reveal key={s.id} delay={Math.min(i * 0.03, 0.3)}>
                <div className="relative">
                  <span
                    className="absolute -left-[26px] top-[15px] w-[15px] h-[15px] rounded-full border-2 border-[var(--ink)]"
                    style={{ background: sevColor(s.severity), boxShadow: s.decision === 'escalated' ? '0 0 0 4px color-mix(in srgb, var(--clay) 22%, transparent)' : 'none' }}
                  />
                  <button
                    onClick={() => expand(s)}
                    className="w-full text-left rounded-xl px-4 py-3.5 transition-colors hover:bg-white/[0.025]"
                  >
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-[0.7rem] text-[var(--text-3)]">{ftime(s.detected_at)}</span>
                      <span className="font-medium text-[var(--text)]">{s.sensor_name}</span>
                      <Chip tone={kindTone(s.kind)}>{s.kind}</Chip>
                      {s.decision === 'escalated' && <Chip tone="clay" dot>escalated</Chip>}
                      {s.decision === 'watching' && <Chip tone="ochre">watching</Chip>}
                    </div>
                    <p className="text-[0.9rem] text-[var(--text-2)] mt-1.5 leading-snug">{s.headline}</p>
                  </button>

                  <div
                    className="grid transition-[grid-template-rows] duration-300 ease-[var(--ease)]"
                    style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                  >
                    <div className="overflow-hidden">
                        <div className="px-4 pb-5 pt-1">
                          {s.agent_reasoning && (
                            <p className="text-[0.87rem] leading-relaxed text-[var(--text-2)] measure">{s.agent_reasoning}</p>
                          )}

                          <div className="mt-4 flex items-end gap-6 flex-wrap">
                            {series[s.sensor_id]?.length > 1 && (
                              <div>
                                <div className="eyebrow mb-1">flow · last 26 weeks</div>
                                <Sparkline data={series[s.sensor_id]} width={160} height={34} stroke="var(--water)" />
                              </div>
                            )}
                            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 font-mono text-[0.75rem]">
                              {Object.entries(s.metrics ?? {}).map(([k, v]) => (
                                <div key={k} className="flex flex-col">
                                  <dt className="text-[var(--text-3)] text-[0.65rem]">{k.replace(/_/g, ' ')}</dt>
                                  <dd className="tnum text-[var(--text-2)]">{String(v)}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>

                          <div className="mt-4 flex items-center gap-4 text-[0.78rem]">
                            {s.model && <span className="text-[var(--text-3)] font-mono">{s.model}</span>}
                            {s.escalation && (
                              <Link href={`/escalated/${s.escalation.id}`} className="text-[var(--water-bright)] hover:underline">
                                Open case file →
                              </Link>
                            )}
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </div>
  );
}
