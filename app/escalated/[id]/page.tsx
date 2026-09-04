'use client';
import { use, useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { api } from '@/lib/api';
import { Reveal, CountUp, Chip, Meter, Ledger, Button, LazyMount } from '@/components/ui';
import { ContourDivider, ContourField, RecessionLoader } from '@/components/marks';
import { CompareSlider } from '@/components/CompareSlider';
import { AgentTranscript } from '@/components/AgentTranscript';
import { HumanGate, Outbox } from '@/components/HumanGate';
import { FlowHistory } from '@/components/FlowHistory';

const RechargeMap = dynamic(() => import('@/components/RechargeMap').then((m) => m.RechargeMap), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] grid place-items-center rounded-xl border border-[var(--paper-line)] bg-[var(--paper-2)]">
      <span className="eyebrow">catchment map</span>
    </div>
  ),
});

const fdate = (s?: string) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const signed = (n?: number | null, unit = '') => (n == null ? '—' : `${n > 0 ? '+' : ''}${n}${unit}`);
const confFill = (c: string) => (c === 'High' ? 0.86 : c === 'Moderate' ? 0.52 : 0.22);

const RUNNING = ['queued', 'investigating'];
const STATUS_LABEL: Record<string, string> = {
  queued: 'queued', investigating: 'investigating…', awaiting_approval: 'awaiting your approval',
  dispatched: 'dispatched', rejected: 'rejected', needs_more: 'more evidence requested', error: 'error', complete: 'complete',
};

export default function Dossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setD(await api(`/api/escalations/${id}`)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (RUNNING.includes(d?.escalation?.status)) {
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }
  }, [d?.escalation?.status, load]);

  async function analyze(degraded = false) {
    setBusy(true);
    await api(`/api/escalations/${id}/analyze${degraded ? '?degraded=1' : ''}`, { method: 'POST' }).catch(() => {});
    await load();
    setBusy(false);
  }

  if (!d) {
    return (
      <div className="min-h-[70vh] grid place-items-center">
        <RecessionLoader label="opening the case file" />
      </div>
    );
  }
  if (d.error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="display-m text-[var(--clay-bright)]">That case file could not be opened.</p>
        <p className="text-[var(--text-3)] mt-2 text-sm">{d.error}</p>
        <Link href="/escalated" className="inline-block mt-6 text-sm text-[var(--water-bright)]">← Back to cases</Link>
      </div>
    );
  }

  const { escalation: e, sensor, signal, flow } = d;
  const disp = e.dispatch ?? {};
  const v = e.verdict ?? {};
  const rech = e.recharge;
  const sat = e.satellite;
  const rain = e.rainfall;
  const ranked = (disp.ranked_causes?.length ? disp.ranked_causes : v.ranked_causes) ?? [];
  const hasReport = !!(disp.primary_cause || v.primary_cause);
  const gatePending = e.gate_status === 'pending';
  const totalTokens = (e.tokens_prompt ?? 0) + (e.tokens_completion ?? 0);

  return (
    <div className="pb-24">
      {/* ============================ HEADER — console ============================ */}
      <header className="relative overflow-hidden border-b border-[var(--hairline)]">
        <ContourField className="absolute -top-6 left-0 right-0 h-56 text-[var(--water)] opacity-[0.05] pointer-events-none" />
        <div className="relative mx-auto max-w-[1180px] px-6 pt-8 pb-9">
          <nav className="text-[0.78rem] text-[var(--text-3)]">
            <Link href="/escalated" className="hover:text-[var(--text-2)]">Cases</Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text-2)]">{sensor?.name}</span>
          </nav>

          <div className="mt-5 flex items-start justify-between gap-6 flex-wrap">
            <div className="rise-in">
              <div className="eyebrow"><span className="font-mono">{disp.case_ref ?? sensor?.id}</span></div>
              <h1 className="display-xl mt-2">{sensor?.name}</h1>
              <p className="text-[0.85rem] text-[var(--text-3)] mt-3">
                {sensor?.village} · {sensor?.elevation_m} m
              </p>
            </div>

            <div className="flex items-center gap-3 rise-in" style={{ animationDelay: '80ms' }}>
              <Chip tone={e.status === 'dispatched' ? 'moss' : e.status === 'error' || e.status === 'rejected' ? 'clay' : gatePending ? 'ochre' : 'water'} dot>
                {STATUS_LABEL[e.status] ?? e.status}
              </Chip>
              {!RUNNING.includes(e.status) && (
                <Button variant="secondary" onClick={() => analyze(false)} disabled={busy}>
                  {busy ? 'Running…' : hasReport ? 'Re-investigate' : 'Investigate'}
                </Button>
              )}
            </div>
          </div>

          {signal && (
            <div className="mt-7 border-l-2 border-[var(--clay-a40)] pl-4 max-w-3xl rise-in" style={{ animationDelay: '140ms' }}>
              <div className="eyebrow text-[var(--clay-bright)]">Why this was opened</div>
              <p className="text-[0.95rem] text-[var(--text)] mt-1.5">{signal.headline}</p>
            </div>
          )}

          {e.steps > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[0.74rem] text-[var(--text-3)] rise-in" style={{ animationDelay: '200ms' }}>
              <span><span className="text-[var(--text)]">{e.steps}</span> steps</span>
              <span><span className={e.tool_failures ? 'text-[var(--ochre)]' : 'text-[var(--text)]'}>{e.tool_failures}</span> tool failure{e.tool_failures === 1 ? '' : 's'} recovered</span>
              <span><span className="text-[var(--text)]">1</span> human gate</span>
              <span><span className="text-[var(--text)]">{totalTokens.toLocaleString()}</span> tokens</span>
              <span><span className="text-[var(--water-bright)]">NPR {Number(e.cost_npr || 0).toFixed(2)}</span></span>
              {e.degraded && <span className="text-[var(--ochre)]">· degraded run</span>}
              <span className="text-[var(--text-3)]">· {(e.models_used ?? []).join(' + ')}</span>
            </div>
          )}
        </div>
      </header>

      {/* ============================ FLOW HISTORY — the "why", at a glance ============================ */}
      {flow?.series?.length > 3 && (
        <div className="mx-auto max-w-[1180px] px-6 mt-8">
          <FlowHistory flow={flow} metrics={signal?.metrics} sensorName={sensor?.name} />
        </div>
      )}

      {/* ============================ TRANSCRIPT — deliverable #2 ============================ */}
      <AgentTranscript trace={e.trace ?? []} downloadHref={`/api/escalations/${id}/trace`} />

      {/* ============================ RUNNING / ERROR ============================ */}
      {RUNNING.includes(e.status) && (
        <div className="mx-auto max-w-[1180px] px-6 py-16">
          <div className="mx-auto max-w-md text-center">
            <RecessionLoader label="agent investigating" />
            <p className="text-[0.9rem] text-[var(--text-2)] mt-6 leading-relaxed">
              Gathering evidence, then stopping at the human gate — usually under two minutes.
            </p>
          </div>
        </div>
      )}
      {e.status === 'error' && (
        <div className="mx-auto max-w-[1180px] px-6 py-12">
          <p className="text-[var(--clay-bright)] text-sm">Investigation failed: {e.error}</p>
        </div>
      )}

      {/* ============================ THE REPORT — paper ============================ */}
      {hasReport && (
        <div className="mx-auto max-w-[1180px] px-6 mt-10">
          <div
            className="paper relative mx-auto max-w-[880px] rounded-2xl px-7 sm:px-12 py-11 shadow-[0_2px_4px_rgba(0,0,0,0.3),0_40px_80px_-32px_rgba(0,0,0,0.55)]"
            style={{ backgroundImage: 'radial-gradient(circle at 20% 0%, rgba(255,255,255,0.5), transparent 60%)' }}
          >
            <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-[var(--water)]" />

            {/* --- THE FINDING --- */}
            <Reveal>
              <div className="eyebrow">Finding — most likely cause</div>
              <h2 className="display-l mt-2 text-[var(--paper-ink)]">{disp.primary_cause || v.primary_cause}</h2>
              <p className="measure mt-4 text-[0.98rem] leading-[1.7] text-[var(--paper-ink)]">{disp.explanation || v.explanation}</p>
              {(disp.implicated_zone || v.implicated_zone) && (
                <p className="measure mt-3 text-[0.9rem] text-[var(--paper-ink-2)]">
                  <span className="eyebrow">Where&nbsp;</span>{disp.implicated_zone || v.implicated_zone}
                </p>
              )}
            </Reveal>

            <div className="my-9"><ContourDivider label="Evidence" tone="paper" /></div>

            {/* --- PLATE I --- */}
            {rech?.polygon ? (
              <Reveal className="mb-11">
                <div className="eyebrow">Plate I · The source area</div>
                <p className="text-[0.9rem] text-[var(--paper-ink-2)] mt-1.5 measure">
                  The ground uphill that most likely feeds the spring, traced across a live elevation model.
                </p>
                <div className="mt-4">
                  <LazyMount
                    minHeight={420}
                    placeholder={<div className="h-[420px] rounded-xl border border-[var(--paper-line)] bg-[var(--paper-2)] grid place-items-center"><span className="eyebrow">catchment map</span></div>}
                  >
                    <RechargeMap polygon={rech.polygon} spring={{ lat: sensor.lat, lng: sensor.lng, name: sensor.name }} springSnapped={rech.spring_snapped} aoi={rech.aoi} />
                  </LazyMount>
                </div>
                <div className="mt-5 max-w-sm">
                  <Ledger rows={[
                    ['catchment area', <><CountUp to={rech.area_km2} decimals={2} /> km²</>],
                    ['elevation range', `${rech.elev_min_m}–${rech.elev_max_m} m`],
                    ['spring elevation', `${rech.elev_spring_m} m`],
                  ]} />
                </div>
              </Reveal>
            ) : (
              <PlateSkipped n="I" title="The source area" reason="The catchment trace did not run — the elevation model was unreachable." />
            )}

            {/* --- PLATE II --- */}
            {sat && !sat.unavailable ? (
              <Reveal className="mb-11">
                <div className="eyebrow">Plate II · What changed</div>
                <p className="text-[0.9rem] text-[var(--paper-ink-2)] mt-1.5 measure">{sat.interpretation}</p>
                <div className="mt-4">
                  {sat.past_image && sat.recent_image ? (
                    <CompareSlider
                      before={sat.recent_image}
                      after={sat.past_image}
                      beforeLabel={`${sat.past_period} — before`}
                      afterLabel={`${sat.recent_period} — now`}
                    />
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {[['then', sat.past_image, sat.past_period], ['now', sat.recent_image, sat.recent_period]].map(([k, img, p]: any) => (
                        <div key={k}>
                          {img ? <img src={img} alt={k} className="w-full rounded-xl border border-[var(--paper-line)]" />
                            : <div className="aspect-[4/3] rounded-xl border border-[var(--paper-line)] grid place-items-center text-[0.75rem] text-[var(--paper-ink-3)]">cloud cover — no clear scene</div>}
                          <div className="font-mono text-[0.68rem] text-[var(--paper-ink-3)] mt-1">{p}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-10 gap-y-3">
                  <ChangeGauge label="Vegetation · NDVI" value={sat.ndvi_change_pct} unit="%" good="up" />
                  <ChangeGauge label="Built-up / bare · NDBI" value={sat.builtup_change_pp} unit=" pp" good="down" />
                </div>
              </Reveal>
            ) : (
              <PlateSkipped n="II" title="What changed" reason={sat?.interpretation || 'No usable Sentinel-2 scene was available for this run.'} />
            )}

            {/* --- PLATE III --- */}
            {rain ? (
              <Reveal className="mb-4">
                <div className="eyebrow">Plate III · The climate</div>
                <p className="text-[0.9rem] text-[var(--paper-ink-2)] mt-1.5 measure">
                  {rain.summary}{rain.stale ? ` ${rain.staleness_note}` : ''}
                </p>
                {rain.yearly && <div className="mt-5"><RainChart rain={rain} /></div>}
                <div className="mt-4 grid sm:grid-cols-2 gap-x-10">
                  <Ledger rows={[
                    ['annual normal', `${rain.annual_normal_mm} mm`],
                    ['last 12 months', `${rain.last12_mm} mm`],
                    ['anomaly', <span className={rain.anomaly_pct < -10 ? 'text-[var(--clay)]' : ''}>{signed(rain.anomaly_pct, '%')}</span>],
                  ]} />
                  <Ledger rows={[
                    ['monsoon anomaly', signed(rain.monsoon_anomaly_pct, '%')],
                    ['longest dry spell', `${rain.dry_spell_days} days`],
                    ['source', <span className="text-[0.7rem]">ERA5-Land{rain.stale ? ' · 4d stale' : ''}</span>],
                  ]} />
                </div>
              </Reveal>
            ) : (
              <PlateSkipped n="III" title="The climate" reason="Rainfall data did not load for this run." />
            )}

            <div className="my-9"><ContourDivider label="Weighing the causes" tone="paper" /></div>

            {/* --- RANKED HYPOTHESES --- */}
            <Reveal>
              <ol className="space-y-7">
                {ranked.map((c: any, i: number) => (
                  <li key={i} className="grid grid-cols-[auto_1fr] gap-x-4">
                    <span className="font-mono text-[0.8rem] text-[var(--paper-ink-3)] pt-1">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <div className="flex items-baseline justify-between gap-4 flex-wrap">
                        <h3 className="display-m text-[var(--paper-ink)]">{c.cause}</h3>
                        <span className="eyebrow shrink-0">{c.confidence}</span>
                      </div>
                      <Meter value={confFill(c.confidence)} tone={c.confidence === 'High' ? 'moss' : c.confidence === 'Moderate' ? 'ochre' : 'water'} className="mt-2 max-w-[220px]" />
                      <div className="mt-3 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-[0.83rem]">
                        <BalanceCol title="Supports" items={c.evidence} tone="moss" />
                        <BalanceCol title="Weighs against" items={c.counter_evidence} tone="clay" />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>

            {/* --- NEXT STEPS --- */}
            {(disp.recommended_actions?.length || v.suggestions?.length) > 0 && (
              <Reveal className="mt-10">
                <div className="my-9"><ContourDivider label="Recommended next steps" tone="paper" /></div>
                <ul className="space-y-4">
                  {(disp.recommended_actions ?? v.suggestions ?? []).map((s: any, i: number) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-[3px] shrink-0 w-4 h-4 rounded-[4px] border border-[var(--paper-ink-3)]" />
                      <p className="text-[0.9rem] leading-relaxed">
                        <span className="font-semibold text-[var(--paper-ink)]">{s.action}</span>
                        <span className="text-[var(--paper-ink-2)]"> — {s.why}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}

            {/* --- FOOTNOTE --- */}
            <div className="mt-12 pt-6 border-t border-[var(--paper-line)] text-[0.72rem] leading-relaxed text-[var(--paper-ink-3)]">
              {(disp.uncertainty || v.uncertainty) && <p className="mb-2">{disp.uncertainty || v.uncertainty}</p>}
              <p>
                An evidence-based hypothesis, not proof. Satellite, elevation and rainfall are live; flow readings are simulated for this prototype.
                {e.models_used?.length > 0 && <> <span className="font-mono">{e.models_used.join(', ')}</span> · <span className="font-mono">NPR {Number(e.cost_npr || 0).toFixed(2)}</span> / run.</>}
              </p>
            </div>

            {/* --- THE DECISION — after the reader has read the case --- */}
            {gatePending && (
              <div className="mt-10">
                <HumanGate escalationId={id} action={e.gate_action} onDone={load} />
              </div>
            )}
            {e.status === 'dispatched' && <div className="mt-10"><Outbox caseRef={disp.case_ref} /></div>}
            {e.status === 'rejected' && (
              <div className="mt-10 rounded-xl border border-[var(--clay-a40)] bg-[var(--clay-a12)] p-4 text-[0.85rem] text-[var(--paper-ink-2)]">
                Rejected by {e.decided_by}. Nothing was filed. Re-investigate to try again.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small pieces ---------- */

function PlateSkipped({ n, title, reason }: { n: string; title: string; reason: string }) {
  return (
    <div className="mb-11 rounded-xl border border-dashed border-[var(--paper-line)] p-4">
      <div className="eyebrow">Plate {n} · {title} — not available</div>
      <p className="text-[0.83rem] text-[var(--paper-ink-3)] mt-1.5 measure">{reason} The agent proceeded on the evidence it had and lowered its confidence accordingly.</p>
    </div>
  );
}

function ChangeGauge({ label, value, unit, good }: { label: string; value: number | null; unit: string; good: 'up' | 'down' }) {
  const isBad = value == null ? false : good === 'up' ? value < -3 : value > 2;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className={`font-mono text-[0.95rem] tnum ${isBad ? 'text-[var(--clay)]' : 'text-[var(--paper-ink)]'}`}>
          {value == null ? '—' : (<><CountUp to={value} decimals={1} prefix={value > 0 ? '+' : ''} />{unit}</>)}
        </span>
      </div>
      <Meter value={value ?? 0} mode="signed" max={20} tone={value == null ? 'water' : isBad ? 'clay' : 'moss'} className="mt-2" />
    </div>
  );
}

function BalanceCol({ title, items, tone }: { title: string; items?: string[]; tone: 'moss' | 'clay' }) {
  const color = tone === 'moss' ? 'var(--moss)' : 'var(--clay)';
  return (
    <div>
      <div className="eyebrow mb-1.5">{title}</div>
      {items?.length ? (
        <ul className="space-y-1.5">
          {items.map((x, i) => (
            <li key={i} className="flex gap-2 leading-snug text-[var(--paper-ink-2)]">
              <span className="mt-[6px] shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              {x}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[var(--paper-ink-3)] text-[0.8rem]">—</p>
      )}
    </div>
  );
}

function RainChart({ rain }: { rain: any }) {
  const data = rain.yearly as { year: number; mm: number }[];
  const normal = rain.annual_normal_mm;
  const lastYear = data.length ? data[data.length - 1].year : 0;
  return (
    <ResponsiveContainer width="100%" height={170}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
        <XAxis dataKey="year" stroke="var(--paper-ink-3)" tick={{ fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={{ stroke: 'var(--paper-line)' }} interval={3} />
        <YAxis stroke="var(--paper-ink-3)" tick={{ fontSize: 9, fontFamily: 'var(--font-mono)' }} tickLine={false} axisLine={false} width={44} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} contentStyle={{ background: 'var(--paper)', border: '1px solid var(--paper-line)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--paper-ink)' }} formatter={(x: any) => [`${x} mm`, 'rainfall']} />
        <ReferenceLine y={normal} stroke="var(--ochre)" strokeDasharray="3 4" strokeWidth={1.25} />
        <Bar dataKey="mm" radius={[2, 2, 0, 0]} isAnimationActive>
          {data.map((row, i) => (
            <Cell key={i} fill={row.year === lastYear ? 'var(--water-deep)' : row.mm < normal * 0.9 ? 'var(--clay)' : 'var(--paper-ink-3)'} fillOpacity={row.year === lastYear ? 1 : row.mm < normal * 0.9 ? 0.75 : 0.5} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
