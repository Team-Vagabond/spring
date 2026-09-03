'use client';
import { use, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { api, fmt } from '@/lib/api';
import { Badge, Button, Panel, Stat } from '@/components/ui';

const RechargeMap = dynamic(() => import('@/components/RechargeMap').then((m) => m.RechargeMap), {
  ssr: false,
  loading: () => <div className="h-[380px] grid place-items-center text-[var(--muted)] panel">Loading map…</div>,
});

export default function EscalationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setD(await api(`/api/escalations/${id}`)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (d?.escalation?.status === 'analyzing') {
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }
  }, [d?.escalation?.status, load]);

  async function analyze() {
    setBusy(true);
    await api(`/api/escalations/${id}/analyze`, { method: 'POST' }).catch(() => {});
    await load();
    setBusy(false);
  }

  if (!d) return <div className="mx-auto max-w-4xl px-5 py-6 text-[var(--muted)]">Loading…</div>;
  if (d.error) return <div className="mx-auto max-w-4xl px-5 py-6 text-rose-300">{d.error}</div>;

  const { escalation: e, sensor, signal } = d;
  const sat = e.satellite;
  const rech = e.recharge;
  const rain = e.rainfall;
  const v = e.verdict;

  return (
    <div className="mx-auto max-w-4xl px-5 py-6 space-y-5">
      <div className="text-sm text-[var(--muted)]">
        <Link href="/escalated" className="hover:text-[var(--text)]">Escalated springs</Link> / {sensor?.name}
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{sensor?.name} <span className="mono text-sm text-[var(--muted)]">{sensor?.id}</span></h1>
          <div className="text-sm text-[var(--muted)]">
            {sensor?.village}, Darchula · {sensor?.elevation_m} m · escalated {fmt.date(e.created_at)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={e.status === 'complete' ? 'green' : e.status === 'error' ? 'red' : 'amber'}>
            {e.status === 'analyzing' ? 'analysing…' : e.status}
          </Badge>
          <Button onClick={analyze} disabled={busy || e.status === 'analyzing'}>
            {busy ? 'Running…' : e.status === 'complete' ? 'Re-run analysis' : 'Run analysis'}
          </Button>
        </div>
      </div>

      {signal && (
        <Panel className="text-sm">
          <span className="text-[var(--muted)]">Trigger: </span>{signal.headline}
          {signal.agent_reasoning && <p className="text-[var(--muted)] mt-1">{signal.agent_reasoning}</p>}
        </Panel>
      )}

      {e.status === 'analyzing' && (
        <Panel className="text-sm text-sky-300">
          Running the deep analysis — fetching Sentinel-2 imagery for the recharge area (then &amp; now),
          tracing the catchment across the elevation model, and pulling 20+ years of rainfall. ~30–60s.
        </Panel>
      )}
      {e.status === 'error' && <Panel className="text-sm text-rose-300">Analysis failed: {e.error}</Panel>}

      {e.status === 'complete' && v && (
        <>
          {/* VERDICT */}
          <Panel className="border-sky-500/30">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Most likely cause</div>
            <div className="text-lg font-semibold mt-0.5">{v.primary_cause}</div>
            <p className="text-sm mt-2">{v.explanation}</p>
            {v.implicated_zone && (
              <p className="text-sm mt-2"><span className="text-[var(--muted)]">Where: </span>{v.implicated_zone}</p>
            )}
            <div className="mt-3 space-y-2">
              {(v.ranked_causes ?? []).map((c: any, i: number) => (
                <div key={i} className="border border-[var(--border)] rounded-lg p-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{i + 1}. {c.cause}</span>
                    <Badge tone={c.confidence === 'High' ? 'green' : c.confidence === 'Moderate' ? 'amber' : 'slate'}>{c.confidence}</Badge>
                  </div>
                  {c.evidence?.length > 0 && (
                    <ul className="list-disc ml-5 mt-1 text-xs text-[var(--muted)]">
                      {c.evidence.map((x: string, j: number) => <li key={j}>{x}</li>)}
                    </ul>
                  )}
                  {c.counter_evidence?.length > 0 && (
                    <ul className="list-disc ml-5 mt-1 text-xs text-amber-300/70">
                      {c.counter_evidence.map((x: string, j: number) => <li key={j}>counter: {x}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {v.uncertainty && (
              <p className="text-xs text-amber-300/90 border border-amber-500/30 rounded-lg p-2 mt-3">
                {v.uncertainty} — evidence-based hypothesis, not proof of causation.
              </p>
            )}
            {e.models_used?.length > 0 && <div className="text-xs text-[var(--muted)] mt-2">models: {e.models_used.join(', ')}</div>}
          </Panel>

          {/* SUGGESTIONS */}
          {v.suggestions?.length > 0 && (
            <Panel>
              <div className="text-sm font-medium mb-2">Suggested next steps</div>
              <ul className="space-y-2 text-sm">
                {v.suggestions.map((s: any, i: number) => (
                  <li key={i}><b>{s.action}</b> <span className="text-[var(--muted)]">— {s.why}</span></li>
                ))}
              </ul>
            </Panel>
          )}

          {/* RECHARGE AREA MAP */}
          {rech?.polygon && (
            <Panel>
              <div className="text-sm font-medium mb-1">Where the spring water comes from</div>
              <p className="text-xs text-[var(--muted)] mb-2">{rech.method}</p>
              <RechargeMap
                polygon={rech.polygon}
                spring={{ lat: sensor.lat, lng: sensor.lng, name: sensor.name }}
                springSnapped={rech.spring_snapped}
                aoi={rech.aoi}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                <Stat label="Catchment area" value={`${rech.area_km2} km²`} />
                <Stat label="Elevation range" value={`${rech.elev_min_m}–${rech.elev_max_m} m`} />
                <Stat label="Spring elevation" value={`${rech.elev_spring_m} m`} />
                <Stat label="DEM resolution" value={`${rech.grid_res_m} m`} />
              </div>
            </Panel>
          )}

          {/* SATELLITE THEN vs NOW */}
          {sat && (
            <Panel>
              <div className="text-sm font-medium mb-1">Then vs now — satellite comparison of the recharge area</div>
              <p className="text-xs text-[var(--muted)] mb-3">{sat.interpretation}</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[['Past', sat.past_period, sat.past_image, sat.ndvi_past, sat.ndbi_past],
                  ['Recent', sat.recent_period, sat.recent_image, sat.ndvi_recent, sat.ndbi_recent]].map(([label, period, img, ndvi, ndbi]: any) => (
                  <div key={label}>
                    <div className="text-xs text-[var(--muted)] mb-1">{label} · {period}</div>
                    {img
                      ? <img src={img} alt={`${label} satellite`} className="rounded-lg border border-[var(--border)] w-full" />
                      : <div className="rounded-lg border border-[var(--border)] aspect-square grid place-items-center text-xs text-[var(--muted)]">too cloudy — no clear scene</div>}
                    <div className="text-xs text-[var(--muted)] mt-1">NDVI {ndvi ?? '—'} · NDBI {ndbi ?? '—'}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Stat label="Vegetation (NDVI)" value={sat.ndvi_change_pct != null ? `${sat.ndvi_change_pct > 0 ? '+' : ''}${sat.ndvi_change_pct}%` : '—'}
                  tone={sat.ndvi_change_pct != null && sat.ndvi_change_pct < -5 ? 'text-rose-300' : 'text-emerald-300'} />
                <Stat label="Built-up (NDBI)" value={sat.builtup_change_pp != null ? `${sat.builtup_change_pp > 0 ? '+' : ''}${sat.builtup_change_pp} pp` : '—'}
                  tone={sat.builtup_change_pp != null && sat.builtup_change_pp > 2 ? 'text-rose-300' : undefined} />
                <Stat label="Usable imagery" value={sat.valid_coverage} />
              </div>
              <p className="text-[11px] text-[var(--muted)] mt-2">Sentinel-2 L2A (Copernicus), least-cloud dry-season mosaic. NDVI = vegetation vigour, NDBI = built / bare surface.</p>
            </Panel>
          )}

          {/* RAINFALL */}
          {rain && (
            <Panel>
              <div className="text-sm font-medium mb-1">Rainfall — is the climate to blame?</div>
              <p className="text-xs text-[var(--muted)] mb-2">{rain.summary} <span className="opacity-70">({rain.source})</span></p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <Stat label="Annual normal" value={`${rain.annual_normal_mm} mm`} />
                <Stat label="Last 12 months" value={`${rain.last12_mm} mm`} />
                <Stat label="Anomaly" value={`${rain.anomaly_pct > 0 ? '+' : ''}${rain.anomaly_pct}%`}
                  tone={rain.anomaly_pct < -10 ? 'text-rose-300' : undefined} />
                <Stat label="Monsoon anomaly" value={`${rain.monsoon_anomaly_pct > 0 ? '+' : ''}${rain.monsoon_anomaly_pct}%`} />
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={rain.yearly}>
                  <XAxis dataKey="year" stroke="#5b6f8f" fontSize={10} />
                  <Tooltip contentStyle={{ background: '#0f1a2c', border: '1px solid #24354f', borderRadius: 8, fontSize: 12 }} formatter={(x: any) => [`${x} mm`, 'rainfall']} />
                  <ReferenceLine y={rain.annual_normal_mm} stroke="#f59e0b" strokeDasharray="3 3" />
                  <Bar dataKey="mm" fill="#38bdf8" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
