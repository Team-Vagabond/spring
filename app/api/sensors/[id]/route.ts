import { admin } from '@/lib/db';
import { bad, json } from '@/lib/http';
import { detectAnomaly, round, seasonalBaseline } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: sensor } = await admin.from('sensors').select('*').eq('id', id).single();
  if (!sensor) return bad('sensor not found', 404);

  const { data: rs } = await admin
    .from('readings').select('flow_lpm, ts')
    .eq('sensor_id', id).order('ts', { ascending: true });
  const readings = (rs ?? []).map((r) => ({ ts: r.ts as string, flow_lpm: r.flow_lpm as number }));
  const series = readings.map((r) => ({ ts: r.ts, discharge_l_min: r.flow_lpm }));
  const current = series.length ? series[series.length - 1].discharge_l_min : null;
  const sb = seasonalBaseline(series, new Date());
  const anomaly = current != null && sensor.active ? detectAnomaly(current, series, new Date()) : null;

  const { data: signals } = await admin
    .from('signals').select('*').eq('sensor_id', id).order('detected_at', { ascending: false }).limit(20);
  const { data: escalations } = await admin
    .from('escalations').select('id, status, created_at, verdict').eq('sensor_id', id).order('created_at', { ascending: false });

  return json({
    sensor,
    readings,
    computed: {
      current_flow_lpm: current,
      seasonal_baseline_lpm: Number.isFinite(sb.baseline) ? round(sb.baseline, 2) : null,
      anomaly,
    },
    signals: signals ?? [],
    escalations: escalations ?? [],
  });
}
