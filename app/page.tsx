'use client';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CountUp, Sparkline, Chip, Button } from '@/components/ui';
import { RecessionLoader, SpringMark } from '@/components/marks';
import { type MapSensor, statusOf, STATUS_COLOR, STATUS_LABEL } from '@/lib/sensor-status';

const SensorMap = dynamic(() => import('@/components/SensorMap').then((m) => m.SensorMap), {
  ssr: false,
  loading: () => (
    <div className="h-full grid place-items-center bg-[var(--ink-2)]">
      <RecessionLoader label="loading terrain" />
    </div>
  ),
});

export default function NetworkPage() {
  const [sensors, setSensors] = useState<MapSensor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await api('/api/sensors');
    setSensors(d.sensors);
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function seed() {
    setBusy(true);
    await api('/api/seed?wipe=1', { method: 'POST' });
    await load();
    setBusy(false);
  }

  const investigating = sensors.filter((s) => s.escalation).length;

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-52px)]">
      {/* ---------------- station rail ---------------- */}
      <aside className="w-full md:w-[344px] shrink-0 md:h-full flex flex-col border-b md:border-b-0 md:border-r border-[var(--hairline)] bg-[var(--ink)]">
        <div className="px-5 pt-6 pb-4">
          <div className="eyebrow">The network</div>
          <h1 className="display-l mt-1.5">Darchula</h1>
          <p className="mt-2 text-[0.82rem] text-[var(--text-3)]">
            <span className="text-[var(--text)] font-medium">{sensors.length}</span> springs watched
            {investigating > 0 && (
              <>
                <span className="mx-1.5">·</span>
                <span className="text-[var(--clay-bright)]">{investigating} under investigation</span>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.66rem] text-[var(--text-3)]">
            {(['healthy', 'watching', 'escalated', 'inactive'] as const).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[k] }} />
                {STATUS_LABEL[k]}
              </span>
            ))}
          </div>
        </div>

        <div className="h-px bg-[var(--hairline)]" />

        <div className="flex-1 overflow-y-auto min-h-[200px]">
          {!loaded && <div className="py-16"><RecessionLoader label="" /></div>}
          {loaded && sensors.length === 0 && (
            <div className="p-6 text-center">
              <p className="text-[0.85rem] text-[var(--text-3)] mb-4">No sensors registered yet.</p>
              <Button variant="primary" size="sm" onClick={seed} disabled={busy}>
                {busy ? 'Setting up…' : 'Set up demo network'}
              </Button>
            </div>
          )}

          {sensors.map((s, i) => {
            const st = statusOf(s);
            const isSel = selected === s.id;
            return (
              <button
                key={s.id}
                style={{ animationDelay: `${40 + i * 45}ms` }}
                onClick={() => setSelected(isSel ? null : s.id)}
                className={`stagger-in w-full text-left px-5 py-3.5 border-l-2 transition-colors ${
                  isSel ? 'border-[var(--water)] bg-white/[0.035]' : 'border-transparent hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: STATUS_COLOR[st] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[0.9rem] font-medium text-[var(--text)] truncate">{s.name}</span>
                      {st === 'escalated' && <Chip tone="clay" className="shrink-0">case open</Chip>}
                    </div>
                    <div className="font-mono text-[0.68rem] text-[var(--text-3)] mt-0.5">
                      {s.id} · {s.elevation_m} m
                    </div>
                    <div className="flex items-end justify-between mt-2 gap-2">
                      <div>
                        <span className="font-mono text-[1.05rem] tnum text-[var(--text)]">
                          {s.current_flow_lpm != null ? s.current_flow_lpm.toFixed(1) : '—'}
                        </span>
                        <span className="font-mono text-[0.66rem] text-[var(--text-3)]"> L/min</span>
                        {s.anomaly_pct != null && (
                          <span
                            className={`font-mono text-[0.7rem] ml-2 ${
                              s.anomaly_pct < -8 ? 'text-[var(--clay-bright)]' : 'text-[var(--text-3)]'
                            }`}
                          >
                            {s.anomaly_pct > 0 ? '+' : ''}{s.anomaly_pct}%
                          </span>
                        )}
                      </div>
                      {s.spark && s.spark.length > 2 && (
                        <Sparkline
                          data={s.spark}
                          width={72}
                          height={22}
                          stroke={st === 'escalated' ? 'var(--clay)' : 'var(--water-deep)'}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="h-px bg-[var(--hairline)]" />
        <div className="px-5 py-3 flex items-center justify-between text-[0.72rem] text-[var(--text-3)]">
          <span className="flex items-center gap-1.5">
            <SpringMark className="w-3.5 h-3.5 text-[var(--water)]" /> live · Darchula
          </span>
          <Link href="/signals" className="hover:text-[var(--text-2)]">watch log →</Link>
        </div>
      </aside>

      {/* ---------------- map ---------------- */}
      <div className="relative flex-1 min-h-[320px]">
        {loaded && sensors.length > 0 && (
          <SensorMap sensors={sensors} selected={selected} onSelect={setSelected} />
        )}
        {loaded && sensors.length === 0 && (
          <div className="h-full grid place-items-center bg-[var(--ink-2)]">
            <div className="text-center">
              <SpringMark className="w-10 h-10 text-[var(--water)] opacity-50 mx-auto" />
              <p className="mt-4 text-[0.9rem] text-[var(--text-3)]">The map lights up once the network is set up.</p>
            </div>
          </div>
        )}

        <SelectedCard sensor={sensors.find((s) => s.id === selected) ?? null} onClose={() => setSelected(null)} />
      </div>
    </div>
  );
}

function SelectedCard({ sensor: s, onClose }: { sensor: MapSensor | null; onClose: () => void }) {
  if (!s) return null;
  const st = statusOf(s);
  return (
    <div
      key={s.id}
      className="rise-in absolute left-4 bottom-4 right-4 sm:right-auto sm:w-[340px] z-[500] card p-4 backdrop-blur-md bg-[var(--ink2-a95)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="display-m text-[var(--text)]">{s.name}</h2>
          <p className="font-mono text-[0.7rem] text-[var(--text-3)] mt-1">
            {s.id} · {s.village}
          </p>
        </div>
        <button onClick={onClose} className="text-[var(--text-3)] hover:text-[var(--text)] text-lg leading-none">×</button>
      </div>

      <dl className="mt-3 font-mono text-[0.78rem] space-y-1.5">
        <Row k="status">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[st] }} />
            {STATUS_LABEL[st]}
          </span>
        </Row>
        <Row k="location">{s.lat.toFixed(4)}°N {s.lng.toFixed(4)}°E · {s.elevation_m} m</Row>
        <Row k="flow now">
          {s.current_flow_lpm != null ? `${s.current_flow_lpm.toFixed(2)} L/min` : 'no signal'}
          {s.anomaly_pct != null && (
            <span className={s.anomaly_pct < -8 ? 'text-[var(--clay-bright)]' : 'text-[var(--text-3)]'}>
              {' '}({s.anomaly_pct > 0 ? '+' : ''}{s.anomaly_pct}% vs baseline)
            </span>
          )}
        </Row>
        {s.signal && <Row k="last read">{s.signal.kind} · {s.signal.decision}</Row>}
      </dl>

      {s.escalation && (
        <Link
          href={`/escalated/${s.escalation.id}`}
          className="mt-3 flex items-center justify-between rounded-lg bg-[var(--clay-a12)] border border-[var(--clay-a40)] px-3 py-2 text-[0.8rem] text-[var(--clay-bright)] hover:bg-[var(--clay-a20)]"
        >
          Open case file
          <span>→</span>
        </Link>
      )}
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="text-[var(--text-3)] w-16 shrink-0">{k}</dt>
      <dd className="text-[var(--text-2)]">{children}</dd>
    </div>
  );
}
