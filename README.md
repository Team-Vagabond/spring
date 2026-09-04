# Naula — an autonomous spring-investigation agent

**Startup Innovation Hackathon Vol. III · Darchula, Nepal**

> Our agent helps **a rural municipality's water desk** work out **why a mountain spring is
> quietly failing and what to do about it** — without **sending a hydrogeologist to every
> spring, or waiting months for anyone to notice**.

Nepal's hills depend on springs, and a spring can lose a quarter of its flow over a year or two
before any office understands what is happening or why. A dashboard doesn't help — it waits for
someone to log in. Naula doesn't wait: a scheduled sweep watches every sensor, and the moment one
crosses a sustained-decline threshold, an agent investigates on its own — pulling rainfall,
tracing the recharge area across an elevation model, comparing the catchment then-and-now by
satellite, weighing competing causes — and hands the municipal water desk a ready-to-approve case with
an SMS brief **in Nepali**. Nothing is sent or filed until a human approves.

---

## Run it

```bash
npm install
node scripts/migrate.mjs              # base schema
node scripts/migrate.mjs migrate_v3.sql   # agent loop / trace / gate / SMS tables
npm run build && npm run start        # http://localhost:3000  (use prod for the demo)
```

`.env.local` holds the Supabase, hackathon-LLM and Copernicus Sentinel Hub credentials
(already populated). Then, in the app:

1. **Network** → *Set up demo network* (seeds 6 springs in Darchula with flow history).
2. **Watch log** → *Run scheduled sweep now* — this fires `POST /api/cron`, the same entry a
   crontab hits. It sweeps every sensor on the cheap model, and for each sustained decline it
   runs a bounded investigation that stops at the human gate.
3. **Cases** → open one → read the **agent transcript**, then **Approve / Reject / Request more**.
   Approve files the case and sends the Nepali SMS (simulated gateway — see *Real vs mocked*).

The degraded / bad-day path (`?degraded=1` on the analyze call) still works but the button was removed from the UI at the client's request — flip it back on in `app/escalated/[id]/page.tsx` if you want it for the pitch (the brief scores a resilience story).

The scheduled trigger, for a real deployment:

```
# crontab — sweep every 6 hours, never left looping
0 */6 * * *  curl -fsS -X POST https://<host>/api/cron
```

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
  cron / button ───▶│  /api/cron   monitoring sweep               │
                    │  · DeepSeek-V4-Flash · 1 call / sensor       │
                    │  · pure-code anomaly maths (seasonal         │
                    │    baseline, z-score, year-on-year)          │
                    └───────────────┬─────────────────────────────┘
                                    │ spring crosses threshold
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
                    │   request_dispatch → ★ THE HUMAN GATE ★      │
                    │                                             │
                    │  · model routing: Flash for recon,          │
                    │    gpt-5.5 once evidence competes            │
                    │  · visible tool failure + retry             │
                    │  · token + NPR cost meter                    │
                    │  · every step → structured trace            │
                    └───────────────┬─────────────────────────────┘
                                    │ status = awaiting_approval
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  HUMAN — /api/escalations/[id]/decision      │
                    │  approve │ reject │ request more evidence    │
                    └───────────────┬─────────────────────────────┘
                          approve → │
                                    ▼
                    ┌─────────────────────────────────────────────┐
                    │  CONSEQUENCE                                 │
                    │  · case filed (register)                     │
                    │  · SMS brief sent — Nepali — to the ward     │
                    │    coordinator + municipal water section    │
                    │  · post-approval monitoring continues        │
                    └─────────────────────────────────────────────┘
```

Stack: Next.js 15 (App Router, TS), Supabase Postgres, the hackathon OpenAI-compatible endpoint
(`gpt-5.5`, `DeepSeek-V4-Flash`), Copernicus Sentinel Hub, Open-Meteo, AWS Terrain Tiles, Leaflet.

Key files:
```
lib/agent/investigator.ts   the bounded agent loop + trace + cost + gate
lib/agent/tools.ts          tool schemas + executors (real geo APIs)
lib/agent/assess.ts         the cheap per-sensor sweep (DeepSeek-Flash)
lib/agent/cost.ts           token → NPR
lib/sms.ts                  simulated SMS gateway
lib/geo/*                   sentinel · dem · springshed (D8) · rainfall
app/api/cron                scheduled entry point
app/api/escalations/[id]/analyze | decision | trace
app/escalated/[id]          the dossier UI (transcript + gate + report)
```

---

## The six agentic signals (brief §02)

| Signal | Where it is, concretely |
|---|---|
| **Given a goal, not a script** | `investigator.ts` system prompt states the objective. Every run gathers evidence in a different order — the model decides, not us. Compare two traces. |
| **Uses tools** | 6 model-invoked tools, 3 backed by live external APIs (Open-Meteo, AWS DEM, Copernicus). The model chooses which and when. |
| **Plans across steps** | 5–8 steps per run; it decomposes ("verify sensor → rule seasonality → environmental causes"), and reasons about *stopping* ("another remote test won't change the ranking"). |
| **Remembers** | Hypothesis state (`note_hypothesis`) carried and updated across the run — e.g. `H_rain` 30% → 45% → 60% as evidence lands. Per-spring history persists across runs in Postgres. |
| **Starts by itself** | `/api/cron` on a schedule. No human in the loop from trigger to the gate. Trace line: *"Threshold crossed on scheduled sweep"*. |
| **Action has a consequence** | On approval: a case is filed and an SMS is sent to named recipients. Something leaves the building. |

**Human checkpoint (required):** `request_dispatch` is the one thing the agent may never do
itself. It drafts the case + SMS and the loop **stops** (`status = awaiting_approval`). Filing
and sending happen only through `/api/escalations/[id]/decision` with a human `approve`. Shown
blocking, live, in the demo.

**Bounded loop (fair use):** `MAX_STEPS = 12`, then the agent stops and asks a human. Every LLM
call's token usage is metered; every run reports a cost in NPR. The scheduled sweep is cheap
(`DeepSeek-V4-Flash`, one call per sensor) and safe to run on a timer; the expensive loop only
fires on a real threshold crossing and self-terminates. Nothing is ever left looping.

---

## What we brought in

- **Next.js**, **Tailwind**, **Leaflet / react-leaflet**, **Recharts**, **@turf/turf**,
  **@supabase/supabase-js**, **pngjs** — all open-source, off the shelf.
- **Google Fonts**: Fraunces, IBM Plex Sans, IBM Plex Mono.
- **Public data / free APIs**: Copernicus Sentinel Hub (free tier), Open-Meteo archive (no key),
  AWS "Terrain Tiles" open dataset, Esri World Imagery basemap, OpenTopoMap.
- No pre-built product. Repo history starts at the event.

## What we built here

The agent loop, the tool layer, the D8 watershed delineation on live DEM tiles, the Sentinel-2
then-vs-now comparison, the rainfall anomaly analysis, the trace format, the token/NPR cost
meter, the human-gate flow, the simulated Nepali SMS gateway, the scheduled sweep, and the whole
UI (Network map / Watch log / the dossier).

---

## Real vs mocked

| Real & live | Mocked / simulated (disclosed) |
|---|---|
| The agent loop — goal-driven tool selection, planning, hypothesis memory, retry, model routing, bounded steps | **Flow-sensor hardware and readings.** No sensors are deployed. Flow history is a seasonal model + a per-spring decline scenario — *not* random noise. The decline is genuinely in the numbers and the anomaly maths genuinely detects it; the numbers are synthetic and we chose which springs decline. |
| Sentinel-2 imagery + NDVI/NDBI (Copernicus), for the real bounding box | Sensor active/inactive state |
| SRTM elevation + D8 watershed trace (AWS Terrain Tiles) | The SMS/IVR gateway — messages are written to a `messages` table and marked "sent"; a real deployment calls Sparrow/Aakash SMS |
| 25 years of rainfall (Open-Meteo / ERA5-Land reanalysis) | The one injected transient failure in `compare_satellite` (attempt 1) — added so the retry is guaranteed visible; the real service also fails intermittently |
| LLM reasoning, token accounting, cost | The list-price cost table (`lib/agent/cost.ts`) — the hackathon endpoint is free, so we price every call as if on public infrastructure for slide 7 |
| Postgres persistence, the trace, the human gate | — |

The recharge polygon is a **topographic estimate** — a real springshed follows subsurface
geology and needs a hydrogeologist. The app labels this everywhere and the agent lowers its
confidence for it. See `docs/DATA-PROVENANCE-AND-IMPACT.md` for a feature-by-feature breakdown.

---

## Known limitations

- **No real sensors.** The whole value proposition assumes someone deploys flow sensors (or
  feeds regular manual gauging into the same pipeline). Everything downstream is real; the input
  is not.
- **Rainfall is reanalysis, not gauges.** ERA5-Land (~9 km grid) gets absolute mm wrong in steep
  terrain. The app reasons from the *anomaly vs its own 20-year climatology*, which is more
  trustworthy, but it is still a modelled estimate.
- **The topographic recharge area is a first guess.** A hydrogeologist would redraw it.
- **Sentinel-2 over Darchula is cloudy in monsoon.** The agent handles "no clear scene" honestly
  (drops the plate, lowers confidence) rather than guessing.
- **A run takes 60–120 s** (mostly `gpt-5.5` latency). Fine for a background agent, slow to watch.
- **Single shared LLM key.** If the endpoint is down, `/api/cron` still completes the sweep with
  the deterministic fallback and the investigation degrades to an honest "cannot resolve
  remotely — field visit" — demonstrated by *Simulate a bad day*.
- No auth; RLS is read-only-anon, writes via service role. Prototype only.

---

## The bad day

*The week the rain does not stop.* Cloud sits over the whole district for ten days; Sentinel-2
returns nothing usable. The sensor at the worst-hit spring has been underwater for two days and
is offline. The shared LLM key is being hammered by fifteen other teams and the frontier model
is rate-limited. Open-Meteo's grid is four days behind.

Naula does not stop and does not bluff. The sweep still runs on the cheap model. The investigation
routes entirely to the fallback model, notes the sensor is offline (*status UNKNOWN — not a
failure*), flags the rainfall as stale, records that satellite evidence is unavailable, and —
because it cannot separate rainfall deficit from abstraction or physical damage without a field
check — it drafts a **low-confidence** case whose recommendation is *"send someone to look"*,
not a confident wrong cause. The SMS still gets drafted in Nepali; it queues until the coordinator
approves. Every degradation is written into the trace. `Simulate a bad day` runs exactly this.
