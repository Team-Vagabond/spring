import { admin } from '../db';
import { env } from '../env';
import { chat, type ChatMessage } from './llm';
import { addUsage, newMeter, nprStr } from './cost';
import { AUTONOMOUS_TOOLS, TOOL_DEFS, runTool, type Ctx } from './tools';
import { FIELD_NOTES } from '../synthetic';

const MAX_STEPS = 12;

export interface TraceEntry {
  t: string;
  kind: 'trigger' | 'plan' | 'agent' | 'tool' | 'retry' | 'gate' | 'note' | 'done' | 'error' | 'action' | 'decision';
  step?: number;
  actor?: string;
  model?: string;
  tool?: string;
  args?: unknown;
  result?: string;
  error?: string;
  ms?: number;
  content?: string;
  confidence?: number;
  tokens?: { p: number; c: number };
}

function systemPrompt(sensor: any, degraded: boolean): string {
  return `You are Naula, an autonomous spring-investigation agent inside the spring-monitoring portal
of a rural municipality (gaunpalika) in Darchula, Nepal. You work for the municipality's own
water & sanitation desk and its ward offices — not a district or central authority.

GOAL: a monitored spring is losing discharge. Work out WHY, with honest confidence, then hand a
ready-to-approve case to the municipal water desk. You are NOT given a script — you decide which
evidence to gather next.

The spring:
- ${sensor.name} (${sensor.id}), ${sensor.village}, ${sensor.elevation_m} m
- expected discharge ~${sensor.expected_flow_lpm} L/min
${FIELD_NOTES[sensor.id] ? `\nLOCAL CONTEXT ON FILE (a lead to VERIFY against your evidence, not proof of cause):\n- ${FIELD_NOTES[sensor.id]}\n` : ''}
HOW TO WORK
1. First establish that the observation is trustworthy (check_sensor), then whether this is just
   normal seasonal variation (check_flow_history).
2. Then investigate environmental causes with the geospatial tools. Maintain COMPETING hypotheses
   (rainfall deficit, vegetation/land-cover loss, recharge-area urbanisation, groundwater
   abstraction, a physical disturbance, sensor fault, plain seasonality). Call note_hypothesis
   every time evidence moves a hypothesis.
3. Never turn a correlation into a proven cause. "Vegetation fell" is evidence for a hypothesis.
4. If a tool fails, decide whether to retry or work around it. Do not give up on one failure.
5. Stop gathering evidence when another test would not meaningfully change the ranking — not when
   you simply have "an answer". You are rewarded for reducing uncertainty honestly.
6. When ready, call request_dispatch. That drafts the case and the SMS brief and STOPS for a human
   to approve. You never send anything yourself.
${degraded ? '\nDEGRADED CONDITIONS: the sensor is offline, rainfall data is stale, and satellite imagery is unavailable. Do the best honest assessment you can, keep confidence LOW, and recommend a field visit rather than guessing a confident cause.\n' : ''}
Keep each message to 2-3 sentences: what you now believe and what you will check next, then the tool call.`;
}

export interface RunResult {
  status: string;
  steps: number;
  toolFailures: number;
  costNpr: number;
  gate: boolean;
}

export async function runInvestigation(
  escalationId: string,
  opts: { degraded?: boolean } = {},
): Promise<RunResult> {
  const { data: esc } = await admin.from('escalations').select('*').eq('id', escalationId).single();
  if (!esc) throw new Error('escalation not found');
  const { data: sensor } = await admin.from('sensors').select('*').eq('id', esc.sensor_id).single();
  if (!sensor) throw new Error('sensor not found');
  const { data: sig } = esc.signal_id
    ? await admin.from('signals').select('*').eq('id', esc.signal_id).single()
    : { data: null };

  const degraded = !!opts.degraded || !!esc.degraded;
  const ctx: Ctx = { escalationId, sensor, degraded, attempts: {}, hypotheses: {}, evidence: {} };
  const meter = newMeter();
  const trace: TraceEntry[] = [];
  const now = () => new Date().toISOString();
  const push = (e: Omit<TraceEntry, 't'>) => trace.push({ t: now(), ...e });

  await admin.from('escalations').update({ status: 'investigating', error: null, degraded }).eq('id', escalationId);

  push({
    kind: 'trigger',
    actor: 'system',
    content: `${esc.trigger_kind === 'scheduled' ? 'Scheduled monitoring sweep' : esc.trigger_kind === 'threshold' ? 'Threshold crossed on a scheduled sweep' : 'Manual investigation'} · source ${sensor.id} · run ${esc.run_id ?? escalationId.slice(0, 8)}${degraded ? ' · degraded conditions' : ''}`,
  });

  // No scripted plan. The goal and the tools are given; the agent's first message IS its plan.
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(sensor, degraded) },
    {
      role: 'user',
      content:
        `A sustained decline was flagged by the code-side monitor: "${sig?.headline ?? 'discharge is well below the seasonal baseline'}". ` +
        `Pre-computed indicators: ${JSON.stringify(sig?.metrics ?? {})}. ` +
        `Decide how to investigate. Start by stating, in one sentence, what you will check and in what order — then make your first tool call.`,
    },
  ];

  let status = 'investigating';
  let step = 0;
  let toolFailures = 0;
  let noToolStreak = 0;

  for (; step < MAX_STEPS; step++) {
    // Model routing: cheap recon model until environmental evidence is in, then the frontier
    // model for the judgement. In degraded mode the frontier model is rate-limited → stay on fallback.
    const haveEnv = !!(ctx.evidence.rainfall || ctx.evidence.satellite || ctx.evidence.recharge);
    const forceGate = step >= MAX_STEPS - 2 || noToolStreak >= 2;
    // Routing: cheap recon model first, frontier model once environmental evidence is in and
    // for the final case draft. In degraded mode the frontier model is rate-limited, so recon
    // stays on the fallback — but the case draft still gets one frontier call.
    const model = forceGate
      ? env.llmModelFrontier
      : degraded
        ? env.llmModelFast
        : haveEnv
          ? env.llmModelFrontier
          : env.llmModelFast;
    if (forceGate) {
      messages.push({
        role: 'user',
        content: 'Enough evidence has been gathered. Call request_dispatch now with your ranked causes, honest confidence, and the Nepali + English SMS brief.',
      });
    }

    let res;
    try {
      res = await chat({
        model,
        messages,
        tools: forceGate ? TOOL_DEFS.filter((t) => t.function.name === 'request_dispatch') : AUTONOMOUS_TOOLS.concat(TOOL_DEFS.filter((t) => t.function.name === 'request_dispatch')),
        toolChoice: forceGate ? 'required' : 'auto',
        maxTokens: 1400,
      });
    } catch (e) {
      push({ kind: 'error', step: step + 1, actor: 'system', content: `LLM call failed: ${(e as Error).message}` });
      status = 'error';
      break;
    }
    addUsage(meter, res.model, res.usage);
    const msg = res.message;
    messages.push({ role: 'assistant', content: msg.content ?? '', tool_calls: msg.tool_calls });
    if (msg.content?.trim()) {
      push({
        kind: 'agent',
        step: step + 1,
        actor: 'agent',
        model: res.model,
        content: msg.content.trim(),
        tokens: { p: res.usage?.prompt_tokens ?? 0, c: res.usage?.completion_tokens ?? 0 },
      });
    }

    if (!msg.tool_calls?.length) {
      noToolStreak++;
      messages.push({ role: 'user', content: 'Call a tool, or call request_dispatch if further testing would not change the ranking.' });
      continue;
    }
    noToolStreak = 0;

    let gated = false;
    for (const tc of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }

      if (tc.function.name === 'request_dispatch') {
        ctx.dispatch = args;
        push({
          kind: 'gate',
          step: step + 1,
          actor: 'agent',
          tool: 'request_dispatch',
          confidence: Number(args.confidence),
          content: `Primary cause: "${args.primary_cause}". Case drafted for the municipal water desk — HUMAN APPROVAL REQUIRED before it is filed.`,
        });
        messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify({ ok: true, status: 'awaiting human approval' }) });
        status = 'awaiting_approval';
        gated = true;
        break;
      }

      const t0 = Date.now();
      let out = await runTool(tc.function.name, args, ctx);
      // one automatic retry for a retryable failure — visible in the trace
      if (!out.ok && out.retryable) {
        toolFailures++;
        push({ kind: 'tool', step: step + 1, actor: 'tool', tool: tc.function.name, args, error: out.error, result: out.summary, ms: Date.now() - t0 });
        await new Promise((r) => setTimeout(r, 900));
        const r0 = Date.now();
        out = await runTool(tc.function.name, args, ctx);
        push({ kind: 'retry', step: step + 1, actor: 'tool', tool: tc.function.name, result: out.summary, ms: Date.now() - r0, error: out.ok ? undefined : out.error });
      } else {
        if (!out.ok) toolFailures++;
        push({
          kind: tc.function.name === 'note_hypothesis' ? 'note' : 'tool',
          step: step + 1,
          actor: 'tool',
          tool: tc.function.name,
          args,
          result: out.summary,
          error: out.ok ? undefined : out.error,
          ms: Date.now() - t0,
        });
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify(out.data) });
    }
    if (gated) break;
  }

  // agent stopped without a usable dispatch → synthesise one from the hypothesis state
  if (status !== 'error' && !ctx.dispatch?.primary_cause) {
    const sorted = Object.values(ctx.hypotheses).sort((a: any, b: any) => b.confidence - a.confidence);
    const ranked = sorted
      .filter((h: any) => h.confidence >= 0.2)
      .map((h: any) => ({
        cause: h.label,
        confidence: h.confidence >= 0.6 ? 'High' : h.confidence >= 0.4 ? 'Moderate' : 'Low',
        evidence: [h.rationale],
        counter_evidence: [],
      }));
    const conf = sorted[0]?.confidence ?? (degraded ? 0.25 : 0.35);
    const primary = degraded && conf < 0.45
      ? 'Cause not resolved — remote data was degraded (offline sensor, stale rainfall, no imagery)'
      : (ranked[0]?.cause ?? 'Cause not resolved from remote data');
    ctx.dispatch = {
      ...(ctx.dispatch ?? {}),
      primary_cause: ctx.dispatch?.primary_cause || primary,
      confidence: ctx.dispatch?.confidence ?? conf,
      ranked_causes: (ctx.dispatch?.ranked_causes?.length ? ctx.dispatch.ranked_causes : ranked),
      explanation: ctx.dispatch?.explanation ||
        `${sensor.name} is roughly ${Math.abs(ctx.evidence.flow?.anomaly_pct ?? 20)}% below its seasonal baseline. ` +
        `${degraded ? 'This run was degraded — the sensor is offline, rainfall data is stale and no clear satellite scene was available, so confidence is low. ' : ''}` +
        `The ranking above is from the recorded hypothesis state; a field visit is needed to confirm.`,
      uncertainty: ctx.dispatch?.uncertainty || 'A field visit is needed to confirm the cause; the topographic recharge estimate may differ from the true springshed.',
      sms_brief_ne: ctx.dispatch?.sms_brief_ne ||
        `${sensor.name} को पानी सामान्यभन्दा करिब ${Math.abs(Math.round(ctx.evidence.flow?.anomaly_pct ?? 20))}% घटेको छ। ${degraded ? 'सेन्सर बन्द भएकाले कारण टाढाबाट पक्का भएन। ' : ''}कृपया वडा र नगरपालिका खानेपानी शाखा र वडा कार्यालयलाई खबर गरी स्थलगत निरीक्षण गर्नुहोस्।`,
      sms_brief_en: ctx.dispatch?.sms_brief_en ||
        `${sensor.name} discharge is ~${Math.abs(Math.round(ctx.evidence.flow?.anomaly_pct ?? 20))}% below normal. ${degraded ? 'Sensor offline; cause not confirmed remotely. ' : ''}Please notify the municipal water & sanitation section and the ward office and arrange a field visit.`,
    };
    push({ kind: 'gate', actor: 'system', content: `Case synthesised from the hypothesis state (confidence ${Math.round((ctx.dispatch.confidence as number) * 100)}%). HUMAN APPROVAL REQUIRED.`, confidence: Number(ctx.dispatch.confidence) });
    status = 'awaiting_approval';
  }

  // persist
  const d = ctx.dispatch ?? {};
  const caseRef = `NAULA-${sensor.id}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const recipients = [
    { label: `वडा कार्यालय, ${sensor.village} — खानेपानी हेर्ने कर्मचारी (Ward office — water focal person)`, number: '+9779800000000' },
    { label: 'नगरपालिका खानेपानी तथा सरसफाइ शाखा (Municipal water & sanitation section)', number: '+9779811111111' },
  ];
  const verdict = {
    primary_cause: d.primary_cause,
    ranked_causes: d.ranked_causes ?? [],
    explanation: d.explanation,
    implicated_zone: d.implicated_zone ?? null,
    suggestions: d.recommended_actions ?? [],
    uncertainty: d.uncertainty,
    __models: [...new Set(trace.filter((x) => x.model).map((x) => x.model))],
  };

  push({
    kind: 'done',
    actor: 'system',
    content: `${step} steps · ${toolFailures} tool failure${toolFailures === 1 ? '' : 's'} recovered · 1 human gate · ${meter.promptTokens + meter.completionTokens} tokens · ${nprStr(meter.usd)} · models: ${[...new Set(trace.filter((x) => x.model).map((x) => x.model))].join(' + ')}`,
  });

  await admin.from('escalations').update({
    status,
    trace,
    tokens_prompt: meter.promptTokens,
    tokens_completion: meter.completionTokens,
    cost_npr: Number(nprStr(meter.usd).replace('NPR ', '')),
    steps: step,
    tool_failures: toolFailures,
    confidence: Number(d.confidence) || null,
    degraded,
    gate_status: status === 'awaiting_approval' ? 'pending' : status === 'error' ? 'none' : 'pending',
    gate_action: 'Open a case in the municipal water & sanitation register for the ward office to act on.',
    dispatch: { ...d, case_ref: caseRef, recipients },
    rainfall: ctx.evidence.rainfall ?? null,
    recharge: ctx.evidence.recharge ?? null,
    satellite: ctx.evidence.satellite ?? null,
    factors: ctx.evidence.flow ?? null,
    verdict,
    models_used: verdict.__models,
    completed_at: new Date().toISOString(),
  }).eq('id', escalationId);

  return { status, steps: step, toolFailures, costNpr: meter.usd / (1 / 133), gate: status === 'awaiting_approval' };
}
