import { admin } from '@/lib/db';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: signals } = await admin
    .from('signals').select('*').order('detected_at', { ascending: false }).limit(60);
  const ids = [...new Set((signals ?? []).map((s) => s.sensor_id))];
  const { data: sensors } = await admin.from('sensors').select('id, name, village').in('id', ids.length ? ids : ['_']);
  const byId = Object.fromEntries((sensors ?? []).map((s) => [s.id, s]));
  const { data: escs } = await admin.from('escalations').select('id, sensor_id, signal_id, status');
  return json({
    signals: (signals ?? []).map((s) => ({
      ...s,
      sensor_name: byId[s.sensor_id]?.name ?? s.sensor_id,
      village: byId[s.sensor_id]?.village ?? '',
      escalation: (escs ?? []).find((e) => e.signal_id === s.id) ?? null,
    })),
  });
}
