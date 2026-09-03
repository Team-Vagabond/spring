# Spring Sentinel — Build Plan & Code Sequence Mindmap

## Mindmap (build order)

```
Spring Sentinel Web App
│
├── 0. Scaffold  ────────────────────────────────
│      Next.js 15 (App Router, TS, Tailwind)
│      deps: @supabase/supabase-js, zod, recharts, clsx, nanoid, date-fns
│
├── 1. Config / env  ────────────────────────────
│      .env.local  (Supabase + Azure OpenAI-compatible LLM)
│      lib/env.ts   (typed env access)
│
├── 2. Database  ────────────────────────────────
│      supabase/schema.sql
│        springs, readings, sensor_status, investigations,
│        hypotheses, evidence, trace_steps, reports,
│        interventions, escalations
│      scripts/migrate.mjs   (push schema via pg)
│      scripts/seed.mjs      (demo Spring #482 + fleet of springs,
│                             synthetic seasonal discharge history)
│
├── 3. Pure logic (NO LLM)  ─────────────────────
│      lib/stats.ts     pct decline, moving avg, seasonal baseline, z-score
│      lib/synthetic.ts deterministic seeded generators:
│                       rainfall, land-cover, roads, groundwater, sensor faults
│
├── 4. Data access  ────────────────────────────
│      lib/db.ts        supabase server client (service role)
│      lib/repo/*.ts    typed queries per table
│
├── 5. Agent core  ─────────────────────────────
│      lib/agent/llm.ts        chat client + tool-calling + model routing
│                              fast: DeepSeek-V4-Flash / frontier: gpt-5.5
│      lib/agent/tools.ts      tool schema + executors:
│                               get_sensor_reading, get_sensor_status,
│                               get_historical_readings, get_rainfall_data,
│                               get_land_cover_change, get_road_changes,
│                               get_groundwater_extraction, get_recharge_polygon,
│                               record_hypothesis_update, escalate_to_coordinator
│      lib/agent/prompt.ts     system prompt (uncertainty-first doctrine)
│      lib/agent/investigator.ts  the autonomous diagnostic loop
│                               - form hypotheses
│                               - tool_choice=auto, dynamic next test
│                               - persist trace/evidence/hypotheses each step
│                               - visible tool failure + retry (satellite)
│                               - offline-sensor branch
│                               - model escalation on ambiguity
│                               - produce ranked report -> HUMAN GATE
│
├── 6. API routes  ─────────────────────────────
│      /api/springs            GET list / POST create(+seed history)
│      /api/springs/[id]       GET detail
│      /api/springs/[id]/simulate   POST advance sim / push reading
│      /api/springs/[id]/sensor     POST force offline / restore
│      /api/monitor            POST scheduled sweep -> spawn investigations
│      /api/investigations/[id]        GET full state
│      /api/investigations/[id]/run    POST run agent loop (SSE stream)
│      /api/reports/[id]/decision      POST approve | reject | request_more
│      /api/interventions              GET list / POST create on approve
│      /api/interventions/[id]/outcome POST record post-intervention readings
│
├── 7. UI  ────────────────────────────────────
│      app/page.tsx                Dashboard: spring fleet, anomaly badges,
│                                  escalations, "Run monitoring"
│      app/springs/[id]/page.tsx   discharge chart, history, sensor panel,
│                                  simulate + force-offline controls
│      app/investigations/[id]/page.tsx  live trace timeline, hypothesis board,
│                                  evidence table, report + APPROVE/REJECT/
│                                  REQUEST MORE gate
│      app/interventions/page.tsx  intervention + outcome monitoring
│      components/*                Card, Badge, TraceTimeline, HypothesisBoard,
│                                  DischargeChart, DisclosureBanner
│
├── 8. Seed + demo scenarios  ──────────────────
│      Spring #482  -> classic case (veg -19pp + new road) => strong multi-cause
│      Spring #217  -> healthy / silent
│      Spring #339  -> sensor offline branch
│      Spring #104  -> rainfall-driven, mild
│      Spring #556  -> post-intervention recovering
│
└── 9. Verify  ────────────────────────────────
       migrate -> seed -> dev server -> smoke test each route
       README with "Real vs Simulated" disclosure
```

## BUILD STATUS — 2026-09-03 (complete, end-to-end verified)

| Area | State |
|---|---|
| Scaffold + deps | ✅ Next.js 15, Tailwind, Supabase, recharts |
| DB schema + grants + migrate script | ✅ applied via session pooler |
| Pure stats (baseline/anomaly/trend) | ✅ `lib/stats.ts` |
| Synthetic sensor + env generators (seeded, scenario-based) | ✅ `lib/synthetic.ts` |
| Agent loop (dynamic tool_choice, hypothesis/evidence state, tool failure+retry, model routing, synthesize fallback) | ✅ `lib/agent/*` |
| API routes (springs, simulate, sensor, monitor, investigations/run SSE, reports/decision, interventions/outcome, seed, escalations) | ✅ |
| UI (dashboard, spring detail, investigation trace+board+ledger+gate, interventions) | ✅ verified in browser |
| Offline-sensor branch | ✅ #339 → status UNKNOWN, low-urgency escalation |
| Human approval gate → intervention → outcome loop | ✅ #482 approved, recovery logged |
| Real vs Simulated disclosure | ✅ banner + /about + README |

Demo data currently seeded: #482 (approved, intervention monitoring), #104 (rainfall diagnosis,
awaiting approval), #339 (sensor offline, awaiting approval), #217 + #556 healthy/silent.

### Follow-ups / known limitations (for later)
- Full investigation run is slow (~1–7 min) because `gpt-5.5` calls are ~20–30s each. Could
  cache frontier or trim escalation.
- `synthesizeReport` frontier JSON call sometimes falls back to the deterministic builder
  (still spec-aligned via `interventionsFor` map).
- Intervention outcome x-axis labels bunch up (all synthetic readings land in one month).
- No auth — prototype only. RLS is read-only-anon; writes via service role.
- `maxDuration=300` on the run route matters only if deployed to Vercel.

## Key design principles (from spec)
- Agent chooses next test dynamically (tool_choice=auto), not a fixed pipeline.
- Distinguish: observed facts / calculated indicators / hypotheses / supporting
  evidence / weakening evidence / uncertainty / field-verification needs.
- Never convert correlation ("forest cover decreased") into causation.
- No verified recharge polygon => candidate zone labelled "Unverified".
- Sensor offline => status UNKNOWN, low-urgency data-loss escalation, extend interval.
- Arithmetic in code, never the LLM.
- Mandatory human approval gate before any consequential action.
- Post-intervention feedback loop; re-investigate if no improvement.
- All simulated components disclosed in UI + README.
```
