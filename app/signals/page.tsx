'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, fmt } from '@/lib/api';
import { Badge, Button, Panel, statusTone } from '@/components/ui';

const KIND_TONE: Record<string, any> = {
  declining: 'red', irregular: 'amber', recovering: 'green', stable: 'slate', inactive: 'slate',
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');

  const load = useCallback(async () => setSignals((await api('/api/signals')).signals), []);
  useEffect(() => { load(); }, [load]);

  async function scan() {
    setBusy(true);
    setProgress('Assessing every sensor…');
    const r = await api('/api/scan', { method: 'POST' });
    await load();
    const toAnalyze = r.escalations.filter((e: any) => !e.reused);
    for (let i = 0; i < toAnalyze.length; i++) {
      setProgress(`Running deep analysis for escalated spring ${i + 1}/${toAnalyze.length} (satellite + recharge + rainfall)…`);
      await api(`/api/escalations/${toAnalyze[i].id}/analyze`, { method: 'POST' }).catch(() => {});
      await load();
    }
    setProgress('');
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Signals</h1>
          <p className="text-sm text-[var(--muted)]">What the monitoring agent noticed on each sensor, and what it decided to do.</p>
        </div>
        <Button tone="primary" onClick={scan} disabled={busy}>{busy ? 'Working…' : 'Run monitoring scan'}</Button>
      </div>

      {progress && <Panel className="text-sm text-sky-300">{progress}</Panel>}

      {signals.length === 0 && !busy && (
        <Panel><div className="text-sm text-[var(--muted)]">No signals yet. Run a monitoring scan.</div></Panel>
      )}

      <div className="space-y-2">
        {signals.map((s) => (
          <Panel key={s.id} className="!p-0 overflow-hidden">
            <button
              onClick={() => setOpen(open === s.id ? null : s.id)}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[var(--panel-2)]"
            >
              <span className="mt-1 w-2 h-2 rounded-full shrink-0"
                style={{ background: s.severity === 'high' ? '#fb7185' : s.severity === 'medium' ? '#fbbf24' : '#64748b' }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{s.sensor_name}</span>
                  <Badge tone={KIND_TONE[s.kind] ?? 'slate'}>{s.kind}</Badge>
                  {s.decision === 'escalated' && <Badge tone="red">escalated</Badge>}
                  {s.decision === 'watching' && <Badge tone="amber">watching</Badge>}
                  <span className="text-xs text-[var(--muted)] ml-auto">{fmt.date(s.detected_at)}</span>
                </div>
                <div className="text-sm text-[var(--muted)] mt-0.5">{s.headline}</div>
              </div>
            </button>
            {open === s.id && (
              <div className="px-4 pb-4 pt-1 border-t border-[var(--border)] text-sm space-y-2">
                {s.agent_reasoning && <p>{s.agent_reasoning}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {Object.entries(s.metrics ?? {}).map(([k, v]) => (
                    <div key={k} className="panel px-2 py-1.5">
                      <div className="text-[var(--muted)]">{k.replace(/_/g, ' ')}</div>
                      <div className="mono">{String(v)}</div>
                    </div>
                  ))}
                </div>
                {s.model && <div className="text-xs text-[var(--muted)]">model: {s.model}</div>}
                {s.escalation && (
                  <Link href={`/escalated/${s.escalation.id}`} className="inline-block text-sky-400 underline">
                    view escalation analysis →
                  </Link>
                )}
              </div>
            )}
          </Panel>
        ))}
      </div>
    </div>
  );
}
