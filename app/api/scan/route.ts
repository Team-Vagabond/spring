import { admin } from '@/lib/db';
import { json } from '@/lib/http';
import { assessSensor } from '@/lib/agent/assess';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const OPEN = ['queued', 'investigating', 'awaiting_approval', 'complete', 'dispatched', 'needs_more'];

/**
 * Manual monitoring sweep (the Watch-log button). Cheap model, one call per
 * sensor. Opens a case for any sustained decline but does NOT run the deep
 * investigation here — the caller kicks that off per case. (The scheduled path,
 * /api/cron, does the whole autonomous chain.)
 */
export async function POST() {
  const runId = nanoid(8);
  const { data: sensors } = await admin.from('sensors').select('id').order('id');
  const signals = [];
  const escalations = [];

  for (const s of sensors ?? []) {
    const res = await assessSensor(s.id);
    if (!res) continue;
    signals.push(res.signal);
    if (!res.escalate) continue;

    const { data: existing } = await admin
      .from('escalations').select('id, status').eq('sensor_id', s.id).in('status', OPEN).limit(1);
    if (existing?.length) {
      escalations.push({ id: existing[0].id, sensor_id: s.id, reused: true });
      continue;
    }
    const { data: esc } = await admin.from('escalations').insert({
      sensor_id: s.id, signal_id: res.signal.id, status: 'queued', trigger_kind: 'manual', run_id: runId,
    }).select('id').single();
    escalations.push({ id: esc!.id, sensor_id: s.id, reused: false });
  }

  return json({ run_id: runId, scanned: sensors?.length ?? 0, signals, escalations });
}
