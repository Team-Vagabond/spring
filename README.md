# Spring Sentinel

Autonomous spring monitoring & investigation for **Darchula district, Nepal**.
Three screens, nothing more:

| Screen | What it is |
|---|---|
| **Map** (`/`) | Satellite map of Darchula with a dot per sensor. Green = active, amber = being watched, red = escalated, grey = inactive. Click a dot → sensor ID, active/inactive, exact location, current flow. |
| **Signals** (`/signals`) | The monitoring agent's log. One row per sensor: what it noticed (declining / irregular / recovering / stable / inactive), the reasoning, and the decision — *watching* or *escalated*. "Run monitoring scan" re-assesses every sensor. |
| **Escalated springs** (`/escalated`) | Only springs the agent escalated for a sustained decline. Each gets a deep analysis (below). |

## The deep analysis (per escalated spring)

Runs three real investigations, then an LLM weighs them:

1. **Where the water comes from** — traces the upslope contributing area (D8 flow
   routing) across a live SRTM-derived elevation model, snapped to the drainage line.
   Drawn as a polygon on a satellite map. Labelled a *topographic estimate* — the true
   recharge area follows subsurface geology.
2. **Then vs now** — pulls a historical dry-season and a recent dry-season **Sentinel‑2**
   scene for that recharge area (Copernicus), computes the change in vegetation (NDVI)
   and built‑up / bare surface (NDBI), and shows both true‑colour images side by side.
   This is how it checks for urbanisation / land‑use change.
3. **Rainfall** — 20+ years of daily precipitation from Open‑Meteo for the spring point:
   annual normal, trailing‑12‑month total, anomaly, monsoon anomaly, longest dry spell.

Then **gpt‑5.5** produces a ranked, uncertainty‑aware verdict: primary cause, ranked
causes with supporting *and* counter evidence, the implicated zone, concrete next steps,
and what still needs field verification. It never states a cause as proven.

## Real vs simulated

| Real & live | Simulated |
|---|---|
| Sentinel‑2 imagery + NDVI/NDBI (Copernicus Data Space) | Flow-sensor hardware & readings |
| SRTM elevation model + D8 watershed delineation (AWS terrain tiles) | Sensor active/inactive state |
| 20+ yr rainfall (Open‑Meteo / ERA5‑Land) | — |
| Agent classification, escalation decision, verdict reasoning | — |
| Postgres persistence (Supabase) | — |

Synthetic flow uses a seasonal model (post‑monsoon peak, pre‑monsoon trough) plus a
per‑sensor scenario — not random noise.

## Run

```bash
npm install
node scripts/migrate.mjs          # applies supabase/schema.sql
npm run dev
```

Open http://localhost:3000 → "Set up demo sensor network" → **Signals** → "Run monitoring scan".
The scan auto-runs the deep analysis for anything it escalates (~40–60 s each: Sentinel‑2 +
DEM + rainfall + LLM).

`.env.local` holds Supabase, the hackathon LLM endpoint, and the Copernicus Sentinel Hub
client credentials. The DB uses the Supabase session-mode pooler (the direct `db.*` host is
IPv6-only).

## Layout

```
lib/geo/sentinel.ts      Sentinel Hub: OAuth, true-colour PNG, NDVI/NDBI statistics, compareEras()
lib/geo/dem.ts           AWS terrarium terrain tiles -> stitched elevation grid
lib/geo/springshed.ts    D8 flow routing + accumulation + upslope delineation -> GeoJSON polygon
lib/geo/rainfall.ts      Open-Meteo archive -> anomaly analysis
lib/agent/assess.ts      per-sensor: stats -> classify -> LLM -> signal (+ escalate?)
lib/analysis/escalation.ts  orchestrates the 3 investigations + the LLM verdict
app/                     3 screens + the escalation detail page
app/api/                 sensors, scan, signals, escalations, escalations/[id]/analyze, seed
```

## Demo sensors (Darchula)

DRC‑01 Khalanga · DRC‑02 Gokuleshwar · DRC‑03 Marma · DRC‑04 Latinath · DRC‑05 Dattu ·
DRC‑06 Sitola (inactive). DRC‑01 and DRC‑03 are seeded with a sustained decline and
escalate on the first scan.
