import { admin } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Deliverable #2 — the agent trace as a plain, readable log. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: esc } = await admin.from('escalations').select('*').eq('id', id).single();
  if (!esc) return new Response('not found', { status: 404 });
  const { data: sensor } = await admin.from('sensors').select('*').eq('id', esc.sensor_id).single();
  const { data: msgs } = await admin.from('messages').select('*').eq('escalation_id', id).order('sent_at');

  const hh = (t: string) => new Date(t).toISOString().slice(11, 19);
  const lines: string[] = [];
  lines.push(`MUL — AGENT TRACE`);
  lines.push(`case            ${esc.dispatch?.case_ref ?? esc.id}`);
  lines.push(`spring          ${sensor?.name} (${esc.sensor_id}) · ${sensor?.village} · ${sensor?.elevation_m} m`);
  lines.push(`trigger         ${esc.trigger_kind}${esc.run_id ? ` · run ${esc.run_id}` : ''}`);
  lines.push(`opened          ${esc.created_at}`);
  lines.push('─'.repeat(72));

  for (const e of (esc.trace ?? []) as any[]) {
    const tag = (e.kind || '').toUpperCase().padEnd(8);
    const stepNo = e.step ? `s${String(e.step).padStart(2, '0')} ` : '    ';
    if (e.kind === 'tool' || e.kind === 'retry' || e.kind === 'note') {
      const a = e.args && Object.keys(e.args).length ? `(${JSON.stringify(e.args)})` : '()';
      const err = e.error ? ` ✗ ${e.error}` : '';
      lines.push(`[${hh(e.t)}] ${stepNo}${tag} ${e.tool}${a}${err}`);
      if (e.result) lines.push(`                     → ${e.result}${e.ms ? `  (${e.ms}ms)` : ''}`);
    } else if (e.kind === 'gate') {
      lines.push(`[${hh(e.t)}] ${stepNo}GATE     ${e.content}`);
    } else if (e.kind === 'agent' || e.kind === 'plan') {
      lines.push(`[${hh(e.t)}] ${stepNo}${e.kind === 'plan' ? 'PLAN' : 'AGENT'}${e.model ? ` · ${e.model}` : ''}`);
      lines.push(`                     ${(e.content || '').replace(/\s+/g, ' ')}`);
      if (e.tokens) lines.push(`                     tokens ${e.tokens.p}+${e.tokens.c}`);
    } else {
      lines.push(`[${hh(e.t)}] ${stepNo}${tag} ${(e.content || '').replace(/\s+/g, ' ')}`);
    }
  }

  lines.push('─'.repeat(72));
  lines.push(`tokens          ${esc.tokens_prompt} prompt + ${esc.tokens_completion} completion`);
  lines.push(`cost            NPR ${Number(esc.cost_npr || 0).toFixed(2)}  (list-price estimate)`);
  lines.push(`models          ${(esc.models_used ?? []).join(' + ')}`);
  lines.push(`outcome         ${esc.status}${esc.gate_status ? ` · gate ${esc.gate_status}` : ''}${esc.decided_by ? ` by ${esc.decided_by}` : ''}`);
  if (msgs?.length) {
    lines.push('');
    lines.push(`SMS OUTBOX (simulated gateway)`);
    for (const m of msgs) lines.push(`  → ${m.to_label} [${m.lang}] : ${m.body}`);
  }

  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
