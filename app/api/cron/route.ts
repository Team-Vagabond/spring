import { admin } from '@/lib/db';
import { json } from '@/lib/http';
import { assessSensor } from '@/lib/agent/assess';
import { runInvestigation } from '@/lib/agent/investigator';
import { addUsage, newMeter, nprStr } from '@/lib/agent/cost';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * The scheduled entry point — nobody presses a button. A cron job hits this
 * (`curl -X POST .../api/cron`) on a slow schedule; it is also wired as a
 * button on the Watch log for the live demo (?trigger=manual).
 *
 * It sweeps every sensor with the cheap model, and for any spring that crosses
 * the sustained-decline threshold it opens a case and runs the bounded
 * investigation, which self-terminates at the human-approval gate. The loop is
 * capped (MAX_STEPS in the investigator) so it can never run away.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const triggerKind = url.searchParams.get('trigger') === 'manual' ? 'manual' : 'scheduled';
  const runId = nanoid(8);
  const meter = newMeter();

  const { data: run } = await admin.from('agent_runs').insert({
    run_id: runId, kind: 'monitoring_sweep', trigger_kind: triggerKind,
  }).select('id').single();

  const { data: sensors } = await admin.from('sensors').select('id').order('id');
  const signals: unknown[] = [];
  const investigations: { sensor_id: string; escalation_id: string; status: string; steps: number; cost_npr: number }[] = [];
  let opened = 0;

  for (const s of sensors ?? []) {
    const res = await assessSensor(s.id);
    if (!res) continue;
    signals.push(res.signal);
    if (res.model) addUsage(meter, res.model, res.usage);
    if (!res.escalate) continue;

    // one open case per spring
    const { data: existing } = await admin
      .from('escalations').select('id')
      .eq('sensor_id', s.id).in('status', ['queued', 'investigating', 'awaiting_approval', 'complete', 'dispatched', 'needs_more']).limit(1);
    if (existing?.length) continue;

    const { data: esc } = await admin.from('escalations').insert({
      sensor_id: s.id, signal_id: res.signal.id, status: 'investigating',
      trigger_kind: 'threshold', run_id: runId,
    }).select('id').single();
    opened++;

    // autonomous, bounded investigation → stops at the human gate
    try {
      const r = await runInvestigation(esc!.id, {});
      const { data: e2 } = await admin.from('escalations').select('cost_npr, steps').eq('id', esc!.id).single();
      investigations.push({ sensor_id: s.id, escalation_id: esc!.id, status: r.status, steps: r.steps, cost_npr: e2?.cost_npr ?? 0 });
    } catch (e) {
      await admin.from('escalations').update({ status: 'error', error: (e as Error).message }).eq('id', esc!.id);
      investigations.push({ sensor_id: s.id, escalation_id: esc!.id, status: 'error', steps: 0, cost_npr: 0 });
    }
  }

  const sweepCostNpr = Number(nprStr(meter.usd).replace('NPR ', ''));
  const totalInvestigationNpr = investigations.reduce((a, i) => a + i.cost_npr, 0);
  const summary =
    `${sensors?.length ?? 0} springs swept on the cheap model (${meter.promptTokens + meter.completionTokens} tokens, ${nprStr(meter.usd)}). ` +
    `${opened} crossed the threshold and were investigated (${totalInvestigationNpr.toFixed(2)} NPR). ` +
    `${investigations.filter((i) => i.status === 'awaiting_approval').length} now waiting on a coordinator.`;

  await admin.from('agent_runs').update({
    finished_at: new Date().toISOString(),
    sensors_checked: sensors?.length ?? 0,
    signals_created: signals.length,
    escalations_opened: opened,
    tokens: meter.promptTokens + meter.completionTokens,
    cost_npr: sweepCostNpr,
    summary,
  }).eq('id', run!.id);

  return json({
    run_id: runId,
    trigger: triggerKind,
    sweep: { checked: sensors?.length ?? 0, sweep_cost_npr: sweepCostNpr, tokens: meter.promptTokens + meter.completionTokens },
    investigations,
    summary,
  });
}
