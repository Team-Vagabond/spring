import { admin } from '@/lib/db';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

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
  return json({ escalation: esc, sensor, signal, messages: messages ?? [] });
}
