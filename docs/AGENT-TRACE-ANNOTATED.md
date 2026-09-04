# Deliverable #2 — the agent trace, annotated

`docs/AGENT-TRACE.txt` is the raw log of one complete run, straight from
`GET /api/escalations/<id>/trace`. It is not sanitised — the failed satellite call is left in.

Below, the same run (Khalanga Mul Dhara, DRC-01) with each line tagged to the agentic signals the
brief asks for (§02) and to the checkpoints it wants to see (human gate, failure + retry, cost).

```
[04:10:09]     TRIGGER  Threshold crossed on a scheduled sweep · source DRC-01 · run KfuSXGBj
```
→ **Signal 5 — starts by itself.** A cron sweep opened this case. No human pressed anything from
here until the checkpoint. `run KfuSXGBj` ties it to the `agent_runs` row for that sweep.

```
[04:10:13] s01 AGENT · DeepSeek-V4-Flash
   The flow drop at Khalanga Mul Dhara is real and significant ... I'll first verify the sensor is
   trustworthy, then check flow history for seasonal context, and then move to environmental
   causes (rainfall, recharge area, satellite imagery). Let me start with the sensor check
```
→ **Signal 1 — given a goal, not a script** + **Signal 3 — plans across steps.** The plan is the
model's own first message. There is no scripted "PLAN" line — we did not tell it this order. Run
the same spring again and the order differs.

```
[04:10:13] s01 TOOL  check_sensor()                    → sensor online · battery 92% · last reading 0.6h old
[04:10:15] s02 TOOL  check_flow_history({"weeks":104}) → flow 5.01 L/min · -20.2% vs seasonal baseline (z=-1.38) · YoY -23.7%
```
→ **Signal 2 — uses tools.** The model picked these two, with arguments (`weeks: 104`). The
seasonal-baseline and z-score maths run inside the tool, in plain code, and are handed back as fact.

```
[04:10:20] s03 NOTE  H_sensor "Sensor fault"              → eliminated (1%)
[04:10:20] s03 NOTE  H_season "Normal seasonal variation" → eliminated (5%)
```
→ **Signal 4 — remembers.** A belief state carried across the run. The agent opens six competing
hypotheses (sensor, seasonality, rainfall, vegetation, urbanisation, abstraction, physical
disturbance) and updates each as evidence lands — not one predetermined answer.

```
[04:10:22] s03 TOOL  check_rainfall()   → rainfall -6.7% vs normal · monsoon -19.1% · dry spell 106d
[04:10:36] s04 TOOL  map_recharge_area()→ catchment ≈ 6.73 km² · 1014–2977 m
```
→ **Signal 2 — real external tools.** `check_rainfall` → Open-Meteo / ERA5-Land, live, this exact
point. `map_recharge_area` → AWS SRTM tiles + a D8 watershed trace, this exact spring.

```
[04:10:33] s04 AGENT · gpt-5.5-2026-04-24
   Rainfall is somewhat deficient ... but the annual deficit alone is smaller than the 20–24%
   discharge decline, so I need to check whether recharge-area changes amplified it.
```
→ **Model routing.** Steps 1–3 ran on `DeepSeek-V4-Flash` (recon). Once the environmental evidence
starts competing, the loop switches to `gpt-5.5`. The `· model` on every AGENT line shows which ran.
Cost falls out of this: NPR 5.42 for the whole run vs the sweep's NPR 0.03.

```
[04:10:49] s05 TOOL  compare_satellite() ✗ 504   → imagery service timed out (504)
[04:10:55] s05 RETRY compare_satellite()         → NDVI -4.8% · built-up -1.4 pp · coverage good
```
→ **Failure + retry, visible.** The Sentinel-2 request failed. The agent's own message the step
before — that it would "compare dry-season satellite indicators" — shows it planned the step; it
retried and got the data. One transient failure is injected here so this is always in the demo; the
real service also 504s.

```
[04:11:32] s06 NOTE  H_veg   "Vegetation / land-cover loss"      → weak (25%)
[04:11:32] s06 NOTE  H_urban "Recharge-area urbanisation"        → weak (8%)
[04:11:32] s06 NOTE  H_abstraction "Groundwater abstraction"     → open (18%)
[04:11:32] s06 NOTE  H_disturbance "Physical disturbance ..."    → open (20%)
```
→ **Signal 4 again.** Four hypotheses updated in one step from the satellite result — urbanisation
pushed down, vegetation held weak, abstraction and physical disturbance left open for a field check.

```
[04:12:22] s07 AGENT · gpt-5.5-2026-04-24
   At this point, another remote test is unlikely to change the ranking ... the case should go to
   the municipal water desk for field checking rather than be treated as proven causation.
```
→ **Signal 3 — knows when to stop.** It is not rewarded for speed. It reasons that another remote
test would not move the ranking, and only then goes to the checkpoint.

```
[04:12:22] s07 GATE  Primary cause: "Reduced recharge from weak monsoon rainfall and prolonged dry
                     spell, possibly amplified by slight vegetation decline ...". Case drafted for
                     the municipal water desk — HUMAN APPROVAL REQUIRED before it is filed.
```
→ **The human checkpoint (required).** `request_dispatch` is the one action the agent may never
take itself. The loop stops here — `status = awaiting_approval`. The cause is stated with hedged
language ("possibly amplified"), not as proof.

```
[04:12:22]     DONE  6 steps · 1 tool failure recovered · 1 human gate · 20692 tokens · NPR 5.42
                     · models: DeepSeek-V4-Flash + gpt-5.5-2026-04-24
```
→ **Cost per run**, for the deck. Bounded at `MAX_STEPS = 12` — this run used 6.

**After a person accepts** (a separate call, `/api/escalations/<id>/decision`), the trace gains:

```
[..] DECISION  ACCEPTED by municipal water desk. Filing case MUL-DRC-01-20260904 in the register.
[..] ACTION    Case MUL-DRC-01-20260904 opened in the municipal water & sanitation register.
               Post-approval monitoring of DRC-01 continues.
```
→ **Signal 6 — the action has a consequence.** A durable record is written for the ward office to
act on — released by a person, not the agent.
