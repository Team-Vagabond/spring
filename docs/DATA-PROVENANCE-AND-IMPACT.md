# Spring Sentinel — Data Provenance & Impact Analysis

Two parts:

- **Part A** — every feature, and exactly what data / method it uses. Marked **REAL**,
  **SYNTHETIC**, or **DERIVED** (real method applied to synthetic or assumed inputs).
- **Part B** — how much this actually improves the problem versus a government officer or
  a small municipal team doing the same work by hand.

Written to be checkable against the source. File references are in `lib/`.

---

# PART A — Feature-by-feature provenance

## 1. Map & basemaps

| Feature | Source | Method | Status | Notes / limits |
|---|---|---|---|---|
| Home map, escalation map | Leaflet 1.9 + react-leaflet 5 | client-side tiles | REAL (library) | — |
| "Satellite" basemap | **Esri World Imagery** tile service (`server.arcgisonline.com/.../World_Imagery`) | XYZ raster tiles | REAL imagery | Mosaic of many providers (Maxar etc.), **mixed acquisition dates**, not a single date. Display only — never analysed. |
| "Terrain" basemap | **OpenTopoMap** (`tile.opentopomap.org`) | XYZ raster tiles | REAL | OSM data + SRTM contours. Display only. |
| "Streets" basemap | **OpenStreetMap** standard tiles | XYZ raster tiles | REAL | Display only. |
| Auto-fit to sensor bounds | `map.fitBounds` on sensor lat/lngs | — | DERIVED | Fits to the synthetic sensor points. |

## 2. Sensors

| Feature | Source | Method | Status | Notes / limits |
|---|---|---|---|---|
| The 6 sensor points | `lib/synthetic.ts` → `SENSOR_SEEDS` | hard-coded list | **SYNTHETIC** | I chose every coordinate, ID, and "installed" date. **No physical sensors exist.** |
| Village names (Khalanga, Gokuleshwar, Marma, Latinath, Dattu, Sitola) | my general knowledge | — | REAL place names, **APPROXIMATE coordinates** | These are real settlements in Darchula district. Coordinates were **not** checked against OpenStreetMap or a gazetteer — they are "near that village", ±1–3 km. |
| Spring names ("Khalanga Mul Dhara", "Marma Naula", …) | constructed | village name + a real word for a water source (*Dhara, Naula, Mul, Kuwa, Pandhero*) | **SYNTHETIC** | Plausible-sounding, **not documented springs**. |
| `elevation_m` on the sensor card | hand-typed in the seed list | — | **SYNTHETIC** (rough) | Approximate; not read from the DEM. |
| `active` / `inactive` flag | hard-coded (`DRC-06` inactive) + `/api/sensors/[id]/toggle` | — | **SYNTHETIC** | — |

## 3. Flow readings (the time series behind every chart and anomaly)

| Feature | Source | Method | Status | Notes / limits |
|---|---|---|---|---|
| ~131 weekly readings per sensor | `lib/synthetic.ts` → `generateFlowHistory()` | `flow = base + 0.20·base·sin(seasonal) + 0.05·base·noise` then a per-scenario trend | **SYNTHETIC** | Deterministic (seeded PRNG per sensor ID). Not random walk — it has a real seasonal shape (post-monsoon peak, pre-monsoon trough). |
| `declining` scenario (DRC‑01, DRC‑03) | same | subtract up to `0.30·base` over 2 yrs + extra `0.12·base` in last 40 weeks | **SYNTHETIC + designed** | I assigned which springs decline. The series genuinely trends down ~30% — it is *not* a flag — but the numbers are invented. |
| `irregular` / `recovering` / `stable` scenarios | same | scenario-specific formula | **SYNTHETIC** | — |
| "Push reading" / simulate buttons | `/api/sensors/[id]/simulate` (if present) | append a value | **SYNTHETIC** | — |

## 4. Signal detection (per-sensor analysis → the "Signals" feed)

All maths here is **real code run on the synthetic series** — so the detection is honest, the input is not.

| Feature | Source | Method | Status |
|---|---|---|---|
| Seasonal baseline | `lib/stats.ts` → `seasonalBaseline()` | mean of readings within ±21 days of the same day-of-year, across all history | REAL method / synthetic input |
| Anomaly % vs baseline | `detectAnomaly()` | `(current − baseline) / baseline · 100` | REAL / synthetic |
| z-score | `zScore()` | `(current − mean) / stddev` of same-season values | REAL / synthetic |
| 8-week trend % | `assess.ts` | mean(last 8) vs mean(prev 8) | REAL / synthetic |
| Year-on-year % | `assess.ts` | mean(last 12 wk) vs mean(same 12 wk one year earlier) | REAL / synthetic |
| Variability (CV %) | `assess.ts` | `stddev / mean` of last 8 weeks | REAL / synthetic |
| Classification (declining / irregular / recovering / stable / inactive) | `assess.ts` | threshold rules on the above | REAL logic |
| Headline + reasoning text | **DeepSeek‑V4‑Flash** LLM (fallback: template) | 1 JSON call with the computed metrics | REAL LLM call |

## 5. Escalation decision

| Feature | Source | Method | Status | Honesty note |
|---|---|---|---|---|
| "eligible to escalate" | `assess.ts` | `kind == declining && anomaly < −14% && z < −1.3` | REAL rule | — |
| "severe" → **force escalate** | `assess.ts` | `anomaly < −20%` → decision set to `escalated` **regardless of the LLM** | REAL rule | Both my `declining` springs sit at ~−24%, so DRC‑01 and DRC‑03 were **always** going to escalate. Designed outcome. |
| Borderline cases | LLM decides `watching` vs `escalated` | 1 JSON call | REAL LLM | Only applies when eligible but not severe — none of the current demo sensors hit this path. |

## 6. Deep analysis — orchestration

`lib/analysis/escalation.ts` runs, in parallel, for one escalated spring:

1. DEM fetch → watershed delineation (§7)
2. Sentinel‑2 then-vs-now (§8)
3. Rainfall analysis (§9)

then one LLM verdict call (§10). Results saved to the `escalations` row + PNGs to
`public/sat/<id>/`.

## 7. "Where the spring water comes from" (recharge-area estimate)

| Sub-feature | Source | Method | Status | Real-world limits |
|---|---|---|---|---|
| Elevation grid | **AWS "Terrain Tiles" open dataset** (`s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`) | fetch ~z13 PNG tiles for a 7 km box (3.5 km radius), decode `elev = R·256 + G + B/256 − 32768` m, stitch | **REAL data** | Underlying source in Nepal is **SRTM ~30 m**, void-filled. Vertical error ~10–16 m RMSE, **worse on steep slopes**. App downsamples to ~50–66 m cells for speed (`lib/geo/dem.ts`, `springshed.ts`). |
| Pit filling | `springshed.ts` → `fillPits()` | 12-pass ε-fill (`+0.01 m` above lowest neighbour) | REAL method | Crude vs a proper priority-flood; fine at this resolution. |
| Flow direction | `delineate()` | **D8** steepest-descent to one of 8 neighbours | REAL, standard | Standard GIS algorithm (O'Callaghan & Mark 1984). |
| Flow accumulation | `delineate()` | topological (high→low) sum | REAL, standard | — |
| Outlet snapping | `delineate()` | snap the given point to the highest-accumulation cell within ±4 cells (~200–350 m); else the lowest cell | DERIVED | **This is a weak point.** If the real point isn't on a modelled channel, the snap can jump to the wrong valley. |
| Catchment polygon | `delineate()` + `maskToPolygon()` | BFS upstream over reversed D8 graph → binary mask → boundary-edge chaining → `turf.simplify(tolerance 0.0004)` | REAL method | — |
| Area, elevation range | `turf.area`, min/max over member cells | — | REAL maths on the derived polygon | |
| `edge_truncated` flag | count of member cells on the grid border | — | REAL | Warns the catchment ran off the 7 km analysis box. |

**What this is:** the **surface topographic catchment of an assumed point**, computed correctly on real SRTM.

**What it is *not*:** a spring's true recharge area. A spring discharges *groundwater*; where that
water infiltrated depends on geology (dip, fractures, lithological contacts), which surface slope
only approximates. Springshed field studies in the Nepal/India mid-hills (ICIMOD, ACWADAM, the
DHARA programme) routinely find the real recharge zone is **offset from, larger/smaller than, or
on the opposite side of a ridge from** the topographic catchment.

**Honest accuracy:**
- As *surface-watershed delineation from 30 m DEM*: mature and well-validated — divide usually
  within 1–2 cells, area within ~10–20 % for multi-km² catchments, **if the outlet sits on a real
  channel**.
- As *a real spring's recharge area*: a **first-order guess a hydrogeologist would redraw** after
  field mapping.
- Here, with **no real spring at the point**, it is a demonstration of the method, not a result.

## 8. "Then vs now" satellite comparison

| Sub-feature | Source | Method | Status | Limits |
|---|---|---|---|---|
| Imagery | **Copernicus Sentinel‑2 L2A** via **Sentinel Hub** (`sh.dataspace.copernicus.eu`), your client credentials | Process API, true-colour PNG, 640×640, `mosaickingOrder: leastCC`, `maxCloudCoverage ≤ 50` | **REAL imagery** | Sentinel‑2: 10 m (B02/03/04/08), 20 m (B11), ~5-day revisit. L2A = atmospherically-corrected surface reflectance. |
| Past window | `escalation.ts` | `2018‑10‑01 → 2019‑05‑31`, aggregation picks the first clear ~100-day slice (≈ Oct 2018 – Jan 2019) | REAL date range | Early dry season. |
| Recent window | `escalation.ts` → `recentWindow()` | `(lastDrySeasonYear‑1)‑10‑01 → …‑05‑31` (≈ Oct 2025 – Jan 2026 today) | REAL date range | Same season → comparable. |
| NDVI (vegetation) | Sentinel Hub **Statistics API** | mean of `(B08−B04)/(B08+B04)` over the AOI, per window | **REAL** | SCL band masks cloud/shadow/snow/water. |
| NDBI (built-up / bare) | Statistics API | mean of `(B11−B08)/(B11+B08)` over the AOI | **REAL** | NDBI is a *proxy* for built/bare surface — also responds to bare soil, harvested fields, rock. Not a building detector. |
| Vegetation change % | `compareEras()` | `(ndvi_recent − ndvi_past) / |ndvi_past| · 100` | REAL maths | |
| Built-up change (pp) | `compareEras()` | `(ndbi_recent − ndbi_past) · 100` | REAL maths | |
| Coverage quality (good/partial/poor) | `compareEras()` | valid pixel count thresholds | REAL | "poor" = cloud/snow ate most pixels — flagged in the UI. |
| The true-colour images shown | Process API PNGs saved to `public/sat/<id>/` | — | **REAL Sentinel‑2 images** of that exact bounding box | The **AOI** is the bbox of the §7 polygon (clamped to 1.2–4 km). So the imagery is real; whether that box is "the recharge area" inherits §7's caveat. |

**Honest accuracy:** the imagery, dates, indices and change numbers are all **genuine remote
sensing**. The two failure modes are (a) residual snow/cloud at 1300–2900 m biasing NDVI even after
masking, and (b) the analysis box being only as meaningful as the §7 polygon.

## 9. Rainfall

| Sub-feature | Source | Method | Status | Limits |
|---|---|---|---|---|
| Daily precipitation 2001→now | **Open-Meteo Archive API** (`archive-api.open-meteo.com/v1/archive`, `daily=precipitation_sum`) | one HTTP GET per spring point | **REAL data**, **but reanalysis not gauge** | Open-Meteo serves **ERA5‑Land** (ECMWF reanalysis), ~9 km native grid, interpolated to the point. It is a *physics model + data assimilation*, **not a rain gauge**. |
| Annual normal | `rainfall.ts` | mean of complete-year totals, 2001 – last complete year | REAL maths | Baseline is 2001–present, not the WMO 1991–2020 standard (no data before 2001 pulled). |
| Trailing-12-month total & anomaly % | `rainfall.ts` | sum of last 365 days vs annual normal | REAL maths | |
| Monsoon (Jun–Sep) normal, last, anomaly % | `rainfall.ts` | per-year Jun–Sep sums | REAL maths | |
| Longest dry spell | `rainfall.ts` | longest run of `<1 mm` days in the trailing year | REAL maths | In Nepal a 90–110 day winter dry spell is *normal*, so the UI only mentions it when rainfall is also >12 % below normal. |
| Yearly bar chart | the per-year totals | Recharts | REAL | |

**Honest accuracy:** ERA5‑Land in steep Himalayan terrain gets **absolute mm wrong** (the 9 km grid
can't resolve valley/ridge rain-shadow). The **% anomaly against its own 20-year climatology** —
which is what the app actually reasons from — is **more trustworthy** than the totals. Still a
modelled estimate for a ~9 km cell, not measured rain at the village.

## 10. The verdict

| Sub-feature | Source | Method | Status |
|---|---|---|---|
| Ranked causes, confidence, evidence, counter-evidence, implicated zone, suggestions, uncertainty | **gpt‑5.5** (hackathon Azure-compatible endpoint); fallback **DeepSeek‑V4‑Flash**; final fallback = deterministic template | 1 JSON call with the §7–§9 outputs + the synthetic flow metrics | **REAL LLM reasoning** over mixed real/synthetic inputs |
| `models_used` shown in UI | recorded per call | — | REAL |

The reasoning is genuine and appropriately hedged (it produced "Moderate / Low / Low / Low"
confidence and an explicit "field verification needed" line in testing). It is reasoning over
inputs that are **part real (elevation, satellite, rainfall) and part invented (that a spring
exists there at all, and its flow)**.

## 11. Persistence

| Feature | Source | Status |
|---|---|---|
| `sensors`, `readings`, `signals`, `escalations` tables | **Supabase Postgres** (real hosted DB, session-pooler connection) | REAL |
| Saved satellite PNGs | `public/sat/<escalationId>/` on disk | REAL files |

---

## Part A summary — one line each

| Layer | Verdict |
|---|---|
| Sensor existence & locations | **Fiction.** Real village names, approximate coordinates, invented spring names. |
| Flow decline | **Real trend in invented numbers.** The series genuinely declines; the numbers are a formula; I chose which springs decline; ≤ −20 % force-escalates. |
| Anomaly / trend / classification maths | **Real algorithms, synthetic input.** |
| Elevation | **Real** (SRTM ~30 m via AWS Terrain Tiles). |
| Recharge-area polygon | **Real algorithm (D8) on real DEM, applied to an assumed point.** Valid as a *surface* catchment estimate; weak as a *spring recharge* estimate; meaningless without a real spring. |
| Then-vs-now satellite (images, NDVI, NDBI) | **Real Sentinel‑2**, real dates, real indices. Analysis box inherits the polygon's caveat. |
| Rainfall | **Real ERA5‑Land reanalysis** (not gauges). Anomalies trustworthy, absolute mm not. |
| LLM verdict | **Real reasoning** over the mix above. |
| Database | **Real.** |

---

# PART B — Impact vs. a government officer doing this by hand

## B.1 Who does this today, and how

In a rural municipality (*gaunpalika*) in a district like Darchula, spring monitoring and
investigation, where it happens at all, falls to:

- a **WASH / water-supply focal person** at the municipality (usually one person, part-time on
  this, no GIS or hydrogeology training), and/or
- a **Water Resources / Small Farmers / DoLI division** officer at district level, and/or
- an **NGO or donor project** (ICIMOD, HELVETAS, SNV, Red Cross, etc.) that occasionally funds a
  proper springshed study for a handful of priority springs.

The manual investigation for **one** spring, done properly (the ICIMOD/ACWADAM "6–8 step"
springshed methodology), looks like:

| Step | Who | Typical effort |
|---|---|---|
| Spring inventory + social/resource mapping | field team (2–3) | ~1 day on site |
| Repeat discharge measurement to establish a trend | field team | multiple visits over months; ≥0.5 day each |
| Geology / rock-type mapping + recharge-area delineation | **hydrogeologist** + GIS analyst | 2–4 days field + office |
| Historical land-use / imagery change analysis | GIS analyst with imagery access | 0.5–1 day |
| Rainfall data request (DHM) + analysis | officer | 0.5–1 day + **days to weeks** for DHM to respond |
| Synthesis + recommendation report | team lead | ~1 day |
| **Getting there** | whole team | Darchula is one of Nepal's remotest districts — **1–2 days travel each way** from a provincial centre; individual springs are hours on foot |

**Realistic totals per spring:** ~**5–12 person-days** across a team that must include one
hydrogeologist/GIS person, and **2–6 weeks of calendar time** including travel scheduling and DHM
data turnaround. Direct cost (Nepal rates, **rough estimate**): consultant days at
NPR 8–20 k/day + team per-diem/transport/vehicle at NPR 10–30 k/day → **order USD 500–2,000 per
spring** for a real study; a quick desk-only rough-cut (no field, no hydrogeologist) still burns
**~1–2 analyst-days ≈ USD 30–120**.

## B.2 What the app does per spring

| Step | Cost | Time |
|---|---|---|
| Scan all sensors (anomaly maths + 1 small LLM call each) | ~USD 0.001–0.01 / sensor | seconds for the whole stock |
| Deep analysis for one escalated spring: DEM fetch + D8 watershed + 2× Sentinel‑2 stats + 2× Sentinel‑2 images + 25 yr rainfall + gpt‑5.5 verdict | **~USD 0.10–0.50** (LLM tokens ≈ $0.05–0.30; Sentinel Hub ≈ a few hundred processing units — the **free tier is 30 000/month ≈ 100–300 analyses free**; DEM/rainfall free) | **~30–60 seconds** |
| Officer reads the resulting one-page evidence packet | staff minutes | ~5–10 min |

## B.3 Side by side

| | Manual (officer + small team) | Spring Sentinel | Improvement |
|---|---|---|---|
| **Springs first-passed per week** | ~1–3 (and only ones already in visible crisis) | entire stock, continuously | ~**50–200×** throughput on the first-pass |
| **Time from "discharge started dropping" to "someone has evidence in front of them"** | **months to years** (this is the exact problem in the project brief) | **same day** once sensor data exists | months → hours |
| **Skill needed to produce the evidence packet** | hydrogeologist + GIS analyst | **none** — officer reads a page | removes the expert bottleneck for the *screening* step |
| **Marginal cost per spring investigated** | ~USD 30–120 (desk) to 500–2,000 (full study) | ~USD 0.10–0.50 | ~**100–4,000×** cheaper per screening |
| **Consistency** | depends who does it; rainfall often skipped, historical imagery rarely compared, springshed rarely drawn | identical checklist every time: rainfall anomaly + NDVI/NDBI then-vs-now + topographic catchment + ranked hypotheses | qualitative, large |
| **Coverage of a 200-spring municipality** | a handful of priority springs, if any (full coverage ≈ 5–20 person-years) | 100 % continuously | from "a few" to "all" |
| **Rainfall data** | request from DHM, days–weeks, per station | 25 years, per point, in ~1 second | days → seconds |
| **Historical land-use comparison** | needs a GIS analyst + imagery; rarely done | automatic, every time | rarely-done → always-done |

### Scenario: one *gaunpalika*, 200 monitored springs, one part-time WASH officer

- **Manual:** the officer can properly look into maybe **5–20 springs/year**, and in practice only
  the ones where a village has already complained. The other ~180 are unmonitored until they fail.
- **Spring Sentinel:** all 200 are screened continuously. On a given scan, perhaps **10–30** are
  trending down; each gets an automatic evidence packet in a minute. The officer spends **~1 day**
  reviewing packets and schedules field visits for the **3–8** that genuinely warrant a
  hydrogeologist — arriving already primed with the rainfall, imagery-change and catchment context.

The officer's job shifts from *"go out and gather evidence on every spring"* (impossible) to
*"review pre-assembled evidence for the worst few and decide where to send the expert"*.

## B.4 What it does **not** improve (be clear about this)

- **Final accuracy of the cause.** The app **narrows and prioritises**; it does not confirm. Every
  verdict still ends in "field verification needed". A wrong LLM verdict that sounds confident is a
  real risk (automation bias) — the UI mitigates this with confidence levels, counter-evidence, and
  an explicit uncertainty line, but a rushed officer could still over-trust it.
- **The recharge area.** Topographic only. A real springshed still needs a hydrogeologist. The app
  gives them a starting polygon, not an answer.
- **Ground truth for flow.** Without real sensors the whole flow layer is fiction. The value
  proposition assumes someone actually deploys and maintains sensors (or does regular manual
  gauging that feeds the same pipeline).
- **Rainfall precision.** ERA5‑Land, not gauges. Fine for anomalies, not for water-balance sums.
- **Field realities** the satellite can't see: a cracked spring box, an illegal tap, a collapsed
  recharge pond, a new bore just out of frame.

## B.5 Net assessment

Spring Sentinel does **not replace** the officer or the hydrogeologist. It replaces the
**weeks-long, hundreds-of-dollars, expert-dependent evidence-gathering step** — for *every* spring,
*continuously*, at *cents each* — so that scarce human expertise is spent only on the few springs
that a data-driven first pass says are worth a field visit, and is spent already holding the
context.

Concretely, for the screening-and-triage layer:

- **throughput:** ~50–200× more springs covered
- **latency:** months/years → same-day
- **cost per spring screened:** ~100–4,000× cheaper
- **skill barrier for screening:** hydrogeologist+GIS → none

and **zero improvement** to the accuracy of the final diagnosis, which still requires a field
visit. All figures in B.3–B.5 are order-of-magnitude estimates for illustration, not measured.

---

# PART C — the agent layer (v3, hackathon build)

| Feature | Source / method | Status | Notes |
|---|---|---|---|
| **The agent loop** | `lib/agent/investigator.ts` — a hand-written bounded tool-calling loop over the hackathon endpoint. Goal in the system prompt; `tool_choice=auto`; `MAX_STEPS=12`. | **REAL** | The model genuinely chooses the next tool. Two runs of the same case take different paths (`docs/AGENT-TRACE.txt`). |
| **The 6 tools** | `lib/agent/tools.ts` — `check_sensor`, `check_flow_history` (DB + `lib/stats`), `check_rainfall` (Open-Meteo), `map_recharge_area` (AWS DEM + D8), `compare_satellite` (Copernicus), `note_hypothesis` (belief state), `request_dispatch` (the gate). | **REAL** methods; 3 hit live external APIs | — |
| **Hypothesis memory** | `ctx.hypotheses` updated by `note_hypothesis`, persisted in `escalations.trace` + `verdict`. Per-spring history in Postgres across runs. | **REAL** | — |
| **Model routing** | `DeepSeek-V4-Flash` for the sweep + first recon steps; `gpt-5.5` once environmental evidence is in and for the case draft. Per-step model recorded in the trace. | **REAL** | The routing rule is code; which model is cheaper is real. |
| **Scheduled trigger** | `POST /api/cron` — sweeps all sensors, opens + investigates threshold crossings. Intended for crontab; the Watch-log button calls it with `?trigger=manual`. | **REAL** endpoint; the *cron schedule itself* is not installed in the demo | Disclosed. A real deploy adds one crontab line. |
| **Token + cost meter** | `lib/agent/cost.ts` accumulates the API's returned `usage`; applies a price table; converts to NPR. | Token counts **REAL**; **prices are public list-price estimates** | The hackathon endpoint is free. We price as if on paid infra so slide 7 has a real number. `gpt-5.5` priced at $1.25/$10 per 1M in/out; `DeepSeek-V4-Flash` at $0.10/$0.30; NPR 133 = USD 1. |
| **Human gate** | `request_dispatch` sets `status=awaiting_approval` and returns. Filing + sending happen only via `POST /api/escalations/[id]/decision` with `decision=approve`. | **REAL** | Shown blocking, live. |
| **Visible tool failure + retry** | `compare_satellite` returns a 504 on attempt 1 (`ctx.attempts`), then the loop retries once and logs `RETRY`. | Method **REAL**; the *attempt-1 failure is injected* | The real Sentinel Hub also 504s intermittently; the injection just guarantees it's in every demo. Disclosed in README + trace annotation. |
| **The consequential action** | On approve: rows written to `escalations` (case filed) + `messages` (SMS), trace gains `ACTION`. | Records **REAL**; **the SMS gateway is simulated** | `lib/sms.ts` writes to a table and marks "sent". A real deploy calls Sparrow SMS / Aakash SMS (Nepal). The Nepali text is written live by `gpt-5.5`. |
| **The Nepali SMS** | Drafted by `gpt-5.5` in `request_dispatch` (`sms_brief_ne`), Devanagari. | **REAL** model output | The +5 Resilience play — Nepali + SMS channel, demonstrated. |
| **The bad-day path** | `?degraded=1` / "Simulate a bad day": sensor forced offline, rainfall flagged stale, `compare_satellite` returns unavailable, frontier model treated as rate-limited (routes to fallback). | **REAL** degradation logic; the *conditions are simulated* | Produces a low-confidence "field visit" case, not a confident wrong cause. |

**Honest summary of Part C:** the agent loop, the tool selection, the planning, the memory, the
routing, the trace, the token counting, the human gate and the record-writing are all real. What
is simulated: the cron schedule is not installed (one line to add), the SMS gateway writes to a
table instead of a telco, one satellite failure is injected for demo reliability, and the cost
*prices* (not the token counts) are list-price estimates because the endpoint is free.
