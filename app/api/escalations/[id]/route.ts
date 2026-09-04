import { admin } from '@/lib/db';
import { bad, json } from '@/lib/http';
import { dayOfYear, round } from '@/lib/stats';

export const dynamic = 'force-dynamic';

// The healthy seasonal expectation for a spring — its installed yield plus the
// Nepal-hills seasonal swing (post-monsoon peak ~Sept, pre-monsoon trough ~May).
// The measured flow pulling away from this line is exactly what "declining" means.
function seasonalNormal(base: number, ts: string): number {
  const doy = dayOfYear(new Date(ts));
  return round(base + Math.sin(((doy - 130) / 365) * 2 * Math.PI) * 0.2 * base, 2);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: esc } = await admin.from('escalations').select('*').eq('id', id).single();
  if (!esc) return bad('escalation not found', 404);
  const { data: sensor } = await admin.from('sensors').select('*').eq('id', esc.sensor_id).single();
  const { data: signal } = esc.signal_id
    ? await admin.from('signals').select('*').eq('id', esc.signal_id).single()
    : { data: null };
  const { data: messages } = await admin
    .from('messages').select('*').eq('escalation_id', id).order('sent_at', { ascending: true });

  // Flow history for the case hero chart: measured vs. seasonal-normal, full record.
  let flow: unknown = null;
  if (sensor) {
    const { data: rs } = await admin
      .from('readings').select('flow_lpm, ts')
      .eq('sensor_id', esc.sensor_id).order('ts', { ascending: true });
    const base = sensor.expected_flow_lpm as number;
    const series = (rs ?? []).map((r) => ({
      t: r.ts as string,
      flow: r.flow_lpm as number,
      normal: seasonalNormal(base, r.ts as string),
    }));
    if (series.length) {
      const last = series[series.length - 1];
      const yearAgo = series[Math.max(0, series.length - 53)];
      flow = {
        series,
        current: last.flow,
        normal_now: last.normal,
        expected: base,
        deficit_pct: round(((last.flow - last.normal) / last.normal) * 100, 1),
        yoy_pct: yearAgo ? round(((last.flow - yearAgo.flow) / yearAgo.flow) * 100, 1) : null,
      };
    }
  }

  return json({ escalation: esc, sensor, signal, messages: messages ?? [], flow });
}
