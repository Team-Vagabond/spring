# Deliverable #2 — the agent trace, annotated

`docs/AGENT-TRACE.txt` is the raw log of one complete run, straight from
`GET /api/escalations/<id>/trace`. It is not sanitised — the failed satellite call is left in.

Below, the same run with each line tagged to the agentic signals the brief asks for (§02), and
to the checkpoints it wants to see (human gate, failure + retry, cost).

```
[18:42:21] TRIGGER  Threshold crossed on scheduled sweep · spring DRC-01 · run uhv2e4K0
```
→ **Signal 5 — starts by itself.** A cron sweep opened this case. No human pressed anything from
here until the gate. `run uhv2e4K0` ties it to the `agent_runs` row for the sweep.

```
[18:42:21] PLAN     ... Plan: verify the sensor and rule seasonality in/out, then work the
                    environmental hypotheses ..., converge, and draft the case ...
```
→ **Signal 1 — given a goal, not a script** + **Signal 3 — plans across steps.** The plan is the
model's, from the goal in the system prompt. We did not tell it this order.

```
[18:42:23] s01 TOOL check_sensor()                    → sensor online · battery 92% ...
[18:42:23] s01 TOOL check_flow_history({"weeks":104}) → -20.2% vs seasonal baseline (z=-1.38) ...
```
→ **Signal 2 — uses tools.** The model picked these two, with arguments (`weeks: 104`). Pure-code
maths (seasonal baseline, z-score) runs inside the tool and is handed back as fact.

```
[18:42:26] s02 TOOL check_rainfall()      → rainfall -8.1% ... monsoon -20.8% ... dry spell 106d
[18:42:29] s02 TOOL map_recharge_area()   → catchment ≈ 6.73 km² · 1014–2977 m
```
→ **Signal 2 — real external tools.** `check_rainfall` → Open-Meteo / ERA5-Land. `map_recharge_area`
→ AWS SRTM tiles + a D8 watershed trace. Both live, both this exact spring.

```
[18:42:37] s03 AGENT · gpt-5.5-2026-04-24   Rainfall is below normal ... but the annual deficit
                    (-8.1%) is smaller than the flow deficit ...
```
→ **Model routing.** Steps 1–2 ran on `DeepSeek-V4-Flash` (recon). Once environmental evidence is
in and the causes start competing, the loop switches to `gpt-5.5`. The `· model` on every AGENT
line shows which ran. Cost falls out of this: NPR 6.45 for the whole run, vs. the sweep's NPR 0.03.

```
[18:42:37] s03 NOTE note_hypothesis({"code":"H_rain", ... "confidence":0.45}) → supported (45%)
...
[18:43:07] s06 NOTE note_hypothesis({"code":"H_rain", ... "confidence":0.55}) → supported (55%)
```
→ **Signal 4 — remembers.** A belief state carried across the run. `H_rain` moves 45% → 55% as
evidence lands; `H_urban` is pushed to 8% by the satellite result. Six competing hypotheses held
at once, not one predetermined answer.

```
[18:42:40] s04 TOOL  compare_satellite() ✗ 504     → imagery service timed out (504)
[18:42:46] s04 RETRY compare_satellite()           → NDVI -4.8% · built-up -1.4 pp · coverage good
```
→ **Failure + retry, visible.** The Sentinel-2 request failed. The agent's own message the step
before — *"If imagery is flaky, I will retry before relying on absence of evidence"* — shows it
planned for this. It retried and got the data. (One transient failure here is injected so this is
always in the demo; the real service also 504s.)

```
[18:43:25] s07 AGENT · gpt-5.5   Further remote testing is unlikely to change the ranking ...
```
→ **Signal 3 — knows when to stop.** It is not rewarded for speed. It reasons that another remote
test would not move the ranking, and only then proceeds to the gate.

```
[18:43:25] s07 GATE  Primary cause: "..." (confidence 58%). Case + SMS drafted ...
                     HUMAN APPROVAL REQUIRED before anything is sent or filed.
```
→ **The human checkpoint (required).** `request_dispatch` is the one action the agent may never
take itself. The loop stops here — `status = awaiting_approval`. Confidence is stated at 58%, not
100%.

```
[18:43:25] DONE  6 steps · 1 tool failure recovered · 1 human gate · 21959 tokens · NPR 6.45
                 · models: DeepSeek-V4-Flash + gpt-5.5-2026-04-24
```
→ **Cost per run**, for slide 7. Bounded at `MAX_STEPS = 12` — this run used 6.

**After the human approves** (a separate call, `/api/escalations/<id>/decision`), the trace gains:

```
[..] HUMAN   APPROVED by ward office. Filing case NAULA-DRC-01-... and sending the SMS brief.
[..] ACTION  Case NAULA-DRC-01-... filed with the municipal water & sanitation section.
             SMS brief sent to 2 recipients in Nepali. Post-approval monitoring continues.
```
→ **Signal 6 — the action has a consequence.** A record is written and a message leaves the
building — released by a human, not the agent.
