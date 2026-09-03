import { admin } from '@/lib/db';
import { json } from '@/lib/http';
import { assessSensor } from '@/lib/agent/assess';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Assess every sensor, write signals, open escalations for sustained declines. */
export async function POST() {
  const { data: sensors } = await admin.from('sensors').select('id').order('id');
  const signals = [];
  const escalations = [];

  for (const s of sensors ?? []) {
    const res = await assessSensor(s.id);
    if (!res) continue;
    signals.push(res.signal);
    if (res.escalate) {
      // don't double-open
      const { data: existing } = await admin
        .from('escalations').select('id, status')
        .eq('sensor_id', s.id).in('status', ['analyzing', 'complete']).limit(1);
      if (existing?.length) {
        escalations.push({ id: existing[0].id, sensor_id: s.id, reused: true });
        continue;
      }
      const { data: esc } = await admin.from('escalations').insert({
        sensor_id: s.id, signal_id: res.signal.id, status: 'analyzing',
      }).select('id').single();
      escalations.push({ id: esc!.id, sensor_id: s.id, reused: false });
    }
  }

  return json({ scanned: sensors?.length ?? 0, signals, escalations });
}
