# Mul — an autonomous spring-investigation agent

**Startup Innovation Hackathon Vol. III · Darchula, Nepal**

> Mul helps **a rural municipality's water desk** work out **why a mountain spring is quietly
> failing and what to do about it** — without **sending a hydrogeologist to every spring, or
> waiting months for anyone to notice**.

Nepal's hills depend on springs, and a spring can lose a quarter of its flow over a year or two
before any office understands what is happening or why. A dashboard doesn't help — it waits for
someone to log in. Mul doesn't wait: a scheduled sweep watches every sensor, and the moment one
crosses a sustained-decline threshold, an agent investigates on its own — pulling rainfall,
tracing the recharge area across an elevation model, comparing the catchment then-and-now by
satellite, weighing competing causes against each other — and hands the water desk a finished
case. **Nothing is filed until a person at the desk accepts it.**

---

## Run it

```bash
npm install
node scripts/migrate.mjs                    # base schema  (supabase/schema.sql)
node scripts/migrate.mjs migrate_v3.sql     # agent loop / trace / gate tables
npm run build && npm run start              # http://localhost:3000  — use prod for the demo
```

`.env.local` holds the Supabase, hackathon-LLM and Copernicus Sentinel Hub credentials (already
populated). If you ran `supabase/schema.sql` and `supabase/migrate_v3.sql` by hand in the Supabase
SQL editor, you can skip the migrate step.

Then, in the app:

1. **Network** → *Set up demo network* — seeds 7 springs in Darchula with 2½ years of flow history.
2. **Watch log** → *Run scheduled sweep now* — fires `POST /api/cron`, the same entry a crontab
   hits. It checks every sensor on the cheap model; for each sustained decline it opens a case and
   runs a bounded investigation that stops at the human checkpoint.
3. **Cases** → open one → read the **agent transcript** (deliverable #2) and the field report,
   then **Accept & file case** at the bottom.

For a real deployment the trigger is a cron line, not a button:

```
# sweep every 6 hours, never left looping
0 */6 * * *  curl -fsS -X POST https://<host>/api/cron
```

### The bad day (resilience)

The degraded path still runs — `POST /api/escalations/<id>/analyze?degraded=1`. It routes fully to
the fallback model, treats the offline sensor as *status UNKNOWN* (not a failure), flags stale
rainfall, records that imagery is unavailable, and drafts a **low-confidence** case whose
recommendation is *"send someone to look"* rather than a confident wrong cause. The UI button was
removed at the client's request; re-enable it in `app/escalated/[id]/page.tsx` if you want it live
in the pitch.

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
  cron / button ───▶│  /api/cron   monitoring sweep               │
                    │  · DeepSeek-V4-Flash · 1 call / sensor       │
                    │  · pure-code anomaly maths (seasonal         │
                    │    baseline, z-score, year-on-year)          │
                    └───────────────┬─────────────────────────────┘
                                    │ spring crosses the threshold
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  lib/agent/investigator.ts                   │
                    │  BOUNDED AGENT LOOP  (MAX_STEPS = 12)        │
                    │  goal in → model picks the next tool         │
                    │                                             │
                    │  tools (lib/agent/tools.ts):                 │
                    │   check_sensor        check_flow_history     │
                    │   check_rainfall  →  Open-Meteo / ERA5-Land  │
                    │   map_recharge_area → AWS terrain DEM + D8    │
                    │   compare_satellite → Copernicus Sentinel-2  │
                    │   note_hypothesis  (belief state / memory)   │
                    │   request_dispatch → ★ THE HUMAN CHECKPOINT ★│
                    │                                             │
                    │  · model routing: Flash for recon,          │
                    │    gpt-5.5 once the causes compete           │
                    │  · visible tool failure + retry             │
                    │  · token + NPR cost meter                    │
                    │  · every step → structured trace            │
                    └───────────────┬─────────────────────────────┘
                                    │ status = awaiting_approval
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  HUMAN — /api/escalations/[id]/decision      │
                    │  accept & file  │  reject  │  request more   │
                    └───────────────┬─────────────────────────────┘
                          accept →  │
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  CONSEQUENCE                                 │
                    │  · case opened in the municipal water &      │
                    │    sanitation register (a durable record)   │
                    │  · post-approval monitoring continues       │
                    └─────────────────────────────────────────────┘
```

Stack: Next.js 15 (App Router, TS), Supabase Postgres, the hackathon OpenAI-compatible endpoint
(`gpt-5.5`, `DeepSeek-V4-Flash`), Copernicus Sentinel Hub, Open-Meteo, AWS Terrain Tiles, Leaflet.

Key files:
```
lib/agent/investigator.ts   the bounded agent loop + trace + cost + checkpoint
lib/agent/tools.ts          tool schemas + executors (real geo APIs)
lib/agent/assess.ts         the cheap per-sensor sweep (DeepSeek-Flash)
lib/agent/cost.ts           token → NPR
lib/geo/*                   sentinel · dem · springshed (D8) · rainfall
app/api/cron                scheduled entry point
app/api/escalations/[id]/analyze | decision | trace
app/escalated/[id]          the dossier UI (flow chart + transcript + report + checkpoint)
```

---

## The six agentic signals (brief §02)

| Signal | Where it is, concretely |
|---|---|
| **Given a goal, not a script** | `investigator.ts` system prompt states the objective and hands over 6 tools. Every run gathers evidence in a different order — the model decides. Compare two traces of the same spring. |
| **Uses tools** | 6 model-invoked tools, 3 backed by live external APIs (Open-Meteo, AWS DEM, Copernicus). The model chooses which and when, with arguments (e.g. `check_flow_history({weeks: 104})`). |
| **Plans across steps** | 5–8 steps per run; it decomposes ("verify sensor → rule seasonality → environmental causes → converge") and reasons about *stopping* ("another remote test won't change the ranking"). |
| **Remembers** | Six competing hypotheses held at once via `note_hypothesis`, re-weighted as evidence lands (e.g. `H_rain` 45% → 55%). Per-spring history persists across runs in Postgres. |
| **Starts by itself** | `/api/cron` on a schedule. No human in the loop from trigger to the checkpoint. Trace line: *"Threshold crossed on a scheduled sweep"*. |
| **Action has a consequence** | On acceptance, a case is opened in the municipal water & sanitation register — a durable record the ward office acts on. Something leaves the building, released by a person. |

**Human checkpoint (required):** `request_dispatch` is the one action the agent may never take
itself. It drafts the case and the loop **stops** (`status = awaiting_approval`). The case is filed
only through `/api/escalations/[id]/decision` with a human `accept`. Shown blocking, live, in the
demo — it sits at the bottom of the report, after the reader has read the case.

**Bounded loop (fair use):** `MAX_STEPS = 12`, then the agent stops and asks a human. Every LLM
call's tokens are metered; every run reports a cost in NPR (a real Khalanga run: **NPR 5.42**). The
scheduled sweep is cheap (`DeepSeek-V4-Flash`, one call per sensor, ~NPR 0.03 for seven springs)
and safe on a timer; the expensive loop only fires on a real threshold crossing and self-terminates.

---

## What we brought in vs. built here

**Brought in:** Next.js, Tailwind, Leaflet / react-leaflet, Recharts, @turf/turf,
@supabase/supabase-js, pngjs — all open-source. Google Fonts (Fraunces, Instrument Sans, IBM Plex
Mono). Public data / free APIs: Copernicus Sentinel Hub (free tier), Open-Meteo archive (no key),
AWS "Terrain Tiles" open dataset, Esri basemaps. No pre-built product; repo history starts at the
event.

**Built here:** the agent loop, the tool layer, D8 watershed delineation on live DEM tiles, the
Sentinel-2 then-vs-now comparison, the rainfall anomaly analysis, the trace format, the token→NPR
cost meter, the human-checkpoint flow, the scheduled sweep, and the whole UI (Network map / Watch
log / the dossier with its flow-history chart, transcript and field report).

---

## Real vs mocked

| Real & live | Mocked / simulated (disclosed) |
|---|---|
| The agent loop — goal-driven tool choice, planning, hypothesis memory, retry, model routing, bounded steps | **Flow-sensor hardware and readings.** No sensors are deployed. Flow history is a seasonal model + a per-spring decline scenario — *not* random noise. The decline is genuinely in the numbers and the anomaly maths genuinely detects it; the numbers are synthetic and we chose which springs decline. |
| Sentinel-2 imagery + NDVI/NDBI (Copernicus) over the real recharge bounding box | The `messages`/dispatch scaffolding for a future SMS/IVR channel — not wired to any gateway; a real deployment would call Sparrow/Aakash SMS |
| SRTM elevation + D8 watershed trace (AWS Terrain Tiles) | The one injected transient failure in `compare_satellite` (attempt 1) — added so the retry is guaranteed visible; the real service also fails intermittently |
| 25 years of rainfall (Open-Meteo / ERA5-Land reanalysis) | The list-price cost table (`lib/agent/cost.ts`) — the hackathon endpoint is free, so we price every call as if on public infrastructure |
| LLM reasoning, token accounting, cost | The `FIELD_NOTES` community report for spring DRC-07 — plausible local context, written by us, given to the agent as *a lead to verify, not proof* |
| Postgres persistence, the trace, the human checkpoint | — |

The recharge polygon is a **topographic estimate** — a real springshed follows subsurface geology
and needs a hydrogeologist. The app says so in the report and the agent treats it as a screening
zone, not a verified boundary. See `docs/DATA-PROVENANCE-AND-IMPACT.md` for a feature-by-feature
breakdown.

---

## Known limitations

- **No real sensors.** The whole value proposition assumes someone deploys flow sensors (or feeds
  regular manual gauging into the same pipeline). Everything downstream is real; the input is not.
- **Rainfall is reanalysis, not gauges.** ERA5-Land (~9 km grid) gets absolute mm wrong in steep
  terrain. The app reasons from the *anomaly vs its own 25-year climatology*, which is more
  trustworthy, but it is still a modelled estimate.
- **The topographic recharge area is a first guess.** A hydrogeologist would redraw it. Putting a
  real accuracy number on it needs field-verified springsheds to benchmark against — roadmap item 1.
- **Sentinel-2 over Darchula is cloudy in monsoon.** The agent handles "no clear scene" honestly
  (drops the plate, lowers its read) rather than guessing. The before/after images use a tight
  post-monsoon window so the two eras are visually comparable.
- **A run takes 60–120 s** (mostly `gpt-5.5` latency). Fine for a background agent, slow to watch.
- **Single shared LLM key.** If the endpoint is down, `/api/cron` still completes the sweep on the
  deterministic fallback and the investigation degrades to an honest "cannot resolve remotely —
  field visit". Demonstrated by the degraded path (`?degraded=1`).
- No auth; RLS is read-only-anon, writes via service role. Prototype only.
