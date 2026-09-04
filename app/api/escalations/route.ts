import { admin } from '@/lib/db';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { data: escs } = await admin
    .from('escalations').select('*').order('created_at', { ascending: false });
  const ids = [...new Set((escs ?? []).map((e) => e.sensor_id))];
  const { data: sensors } = await admin.from('sensors').select('*').in('id', ids.length ? ids : ['_']);
  const byId = Object.fromEntries((sensors ?? []).map((s) => [s.id, s]));
  return json({
    escalations: (escs ?? []).map((e) => ({
      id: e.id, sensor_id: e.sensor_id, status: e.status, error: e.error,
      created_at: e.created_at, completed_at: e.completed_at,
      trigger_kind: e.trigger_kind, gate_status: e.gate_status,
      steps: e.steps, tool_failures: e.tool_failures, cost_npr: e.cost_npr,
      confidence: e.confidence, degraded: e.degraded,
      sensor: byId[e.sensor_id] ?? null,
      primary_cause: e.verdict?.primary_cause ?? e.dispatch?.primary_cause ?? null,
      rainfall_anomaly_pct: e.rainfall?.anomaly_pct ?? null,
      ndvi_change_pct: e.satellite?.ndvi_change_pct ?? null,
      builtup_change_pp: e.satellite?.builtup_change_pp ?? null,
    })),
  });
}
