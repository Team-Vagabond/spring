import { admin } from '@/lib/db';
import { bad, json } from '@/lib/http';
import { runEscalationAnalysis } from '@/lib/analysis/escalation';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: esc } = await admin.from('escalations').select('id, status').eq('id', id).single();
  if (!esc) return bad('escalation not found', 404);
  try {
    await runEscalationAnalysis(id);
    const { data: updated } = await admin.from('escalations').select('*').eq('id', id).single();
    return json({ ok: true, escalation: updated });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}
