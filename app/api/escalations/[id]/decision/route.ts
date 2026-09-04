import { admin } from '@/lib/db';
import { bad, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * The human checkpoint. The agent has drafted a case and stopped. Nothing is filed
 * until someone at the municipal water desk accepts it here.
 * body: { decision: 'approve' | 'reject' | 'request_more', by?: string, note?: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const decision = b.decision as string;
  if (!['approve', 'reject', 'request_more'].includes(decision)) return bad('decision must be approve | reject | request_more');

  const { data: esc } = await admin.from('escalations').select('*').eq('id', id).single();
  if (!esc) return bad('escalation not found', 404);
  if (esc.gate_status !== 'pending') return bad(`nothing pending approval (gate is "${esc.gate_status}")`);

  const by = b.by || 'municipal water desk';
  const at = new Date().toISOString();
  const trace = Array.isArray(esc.trace) ? [...esc.trace] : [];

  if (decision === 'reject') {
    trace.push({ t: at, kind: 'decision', actor: 'coordinator', content: `REJECTED by ${by}${b.note ? ` — ${b.note}` : ''}. Nothing sent or filed.` });
    await admin.from('escalations').update({ status: 'rejected', gate_status: 'rejected', decided_by: by, decided_at: at, trace }).eq('id', id);
    return json({ ok: true, decision });
  }

  if (decision === 'request_more') {
    trace.push({ t: at, kind: 'decision', actor: 'coordinator', content: `MORE EVIDENCE requested by ${by}${b.note ? ` — ${b.note}` : ''}.` });
    await admin.from('escalations').update({ status: 'needs_more', gate_status: 'none', decided_by: by, decided_at: at, trace }).eq('id', id);
    return json({ ok: true, decision });
  }

  // approve → the consequential action: the case is filed in the register
  const d = esc.dispatch ?? {};
  const caseRef = d.case_ref ?? `MUL-${esc.sensor_id}`;

  trace.push({ t: at, kind: 'decision', actor: 'coordinator', content: `ACCEPTED by ${by}. Filing case ${caseRef} in the register.` });
  trace.push({
    t: new Date().toISOString(),
    kind: 'action',
    actor: 'system',
    content: `Case ${caseRef} opened in the municipal water & sanitation register. Post-approval monitoring of ${esc.sensor_id} continues.`,
  });

  await admin.from('escalations').update({
    status: 'dispatched',
    gate_status: 'approved',
    decided_by: by,
    decided_at: at,
    trace,
  }).eq('id', id);

  return json({ ok: true, decision, case_ref: caseRef });
}
