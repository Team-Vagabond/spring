import { admin } from '@/lib/db';
import { json } from '@/lib/http';
import { detectAnomaly } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: sensors } = await admin.from('sensors').select('*').order('id');
  const out = [];
  for (const s of sensors ?? []) {
    const { data: rs } = await admin
      .from('readings').select('flow_lpm, ts')
      .eq('sensor_id', s.id).order('ts', { ascending: true });
    const series = (rs ?? []).map((r) => ({ ts: r.ts as string, discharge_l_min: r.flow_lpm as number }));
    const current = series.length ? series[series.length - 1].discharge_l_min : null;
    const anomaly = current != null && s.active ? detectAnomaly(current, series, new Date()) : null;

    // downsampled spark for the station rail (~24 points, most recent ~78 weeks)
    const tail = series.slice(-78).map((p) => p.discharge_l_min);
    const step = Math.max(1, Math.ceil(tail.length / 24));
    const spark = tail.filter((_, idx) => idx % step === 0);

    const { data: latestSignal } = await admin
      .from('signals').select('kind, severity, decision, detected_at')
      .eq('sensor_id', s.id).order('detected_at', { ascending: false }).limit(1);
    const { data: openEsc } = await admin
      .from('escalations').select('id, status')
      .eq('sensor_id', s.id).order('created_at', { ascending: false }).limit(1);

    out.push({
      id: s.id, name: s.name, village: s.village, lat: s.lat, lng: s.lng,
      elevation_m: s.elevation_m, active: s.active, installed_on: s.installed_on,
      expected_flow_lpm: s.expected_flow_lpm,
      current_flow_lpm: current,
      last_reading_ts: series.at(-1)?.ts ?? null,
      anomaly_pct: anomaly?.anomalyPct ?? null,
      spark,
      signal: latestSignal?.[0] ?? null,
      escalation: openEsc?.[0] ?? null,
    });
  }
  return json({ sensors: out });
}
