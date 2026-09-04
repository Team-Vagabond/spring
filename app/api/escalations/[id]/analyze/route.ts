import { admin } from '@/lib/db';
import { bad, json } from '@/lib/http';
import { runInvestigation } from '@/lib/agent/investigator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: esc } = await admin.from('escalations').select('id, status').eq('id', id).single();
  if (!esc) return bad('escalation not found', 404);
  const degraded = new URL(req.url).searchParams.get('degraded') === '1';
  try {
    const result = await runInvestigation(id, { degraded });
    const { data: updated } = await admin.from('escalations').select('*').eq('id', id).single();
    return json({ ok: true, result, escalation: updated });
  } catch (e) {
    await admin.from('escalations').update({ status: 'error', error: (e as Error).message }).eq('id', id);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
