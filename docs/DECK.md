# Mul — pitch deck (8 slides)

Structure is the brief's (§07). Eight is the ceiling. Spend a third of the six minutes on slide 4.

---

## 1 · The problem, in one human sentence

> In a Darchula village, the spring the whole ward drinks from has been giving a quarter
> less water for two years. Nobody with the authority to act knows why — because finding
> out means a hydrogeologist, a GIS analyst, rainfall records from Kathmandu, and a trek,
> and that has never once happened for this spring.

*(No market-size slide. Just Ranju's problem.)*

Visual: one photo of a hill spring / naula. One line of text.

---

## 2 · Who, exactly

**Ranju Bhatta** — WASH focal person at a rural municipality office.
- One person, part-time on water. No GIS, no hydrogeology.
- Responsible for **50–250 springs** she cannot visit.
- Today: she hears about a failing spring months late, from a complaint, and has no way to
  triage which of the 250 is worst or to arrive knowing what changed around it.

She is not "farmers in Nepal". She is one desk, findable, in every one of Nepal's 753 local units.

---

## 3 · What Mul does, unasked

> A scheduled sweep watches every sensor. The moment one crosses a sustained-decline
> threshold, an agent investigates on its own — rainfall, the recharge area traced from
> terrain, a then-and-now satellite comparison of that area, competing causes weighed —
> and hands Ranju a ready-to-approve case with a Nepali SMS brief.
>
> **It never sends or files anything itself.**

One line under it: *from scheduled trigger to a case on her desk, no human touches it.*

---

## 4 · Live demo  *(spend ~2 minutes here)*

Run order:
1. **Watch log → "Run scheduled sweep now"** — say: *this is `POST /api/cron`, a crontab hits it,
   nobody presses a button in production.* Six springs swept on the cheap model for **NPR 0.03**.
   Two cross the threshold.
2. **Open the case for Khalanga Mul Dhara.** Scroll the **agent transcript** — point at:
   - `TRIGGER Threshold crossed on scheduled sweep` — it started itself
   - the model choosing tools in an order we did not script
   - `tool compare_satellite ✗ 504` → `RETRY → NDVI −4.8%` — a real failure it recovered from
   - `note_hypothesis H_rain → 30% → 45% → 60%` — it remembers and updates
   - `GATE — HUMAN APPROVAL REQUIRED` — it stopped
3. **The case:** most likely cause, ranked hypotheses with *for and against*, the recharge map,
   the before/after satellite wipe, 25 years of rainfall. Confidence **60%**, stated.
4. **Approve.** The Nepali SMS goes to the ward office and the municipal water section;
   the case is filed. `ACTION` appears in the trace. **That is the consequence.**

Fallback: the 60-second video (deliverable #6).

---

## 5 · How it works

```
cron → sweep (DeepSeek-V4-Flash, 1 call/sensor, pure-code anomaly maths)
     → BOUNDED AGENT LOOP  (MAX_STEPS 12)
          6 tools, 3 on live external APIs (Open-Meteo · AWS SRTM · Copernicus Sentinel-2)
          model picks the next tool · plans · updates a hypothesis state · retries failures
          routing: Flash for recon → gpt-5.5 once evidence competes
          every step → a structured trace · every call → tokens → NPR
     → HUMAN GATE  → approve → file case + send Nepali SMS
```

- **Given a goal, not a script** — two runs of the same case gather evidence in a different order.
- **Memory** — hypothesis beliefs across the run; per-spring history across runs, in Postgres.
- **Model routing** — 90% of calls on the cheap model; we can show the cost difference.

---

## 6 · The bad day

> *The week the rain does not stop.* Ten days of cloud — no usable Sentinel-2. The worst spring's
> sensor is underwater and offline. The shared LLM key is rate-limited. Rainfall data is four
> days stale.

Mul:
- sweep still runs (cheap model, deterministic fallback)
- investigation routes **entirely** to the fallback model
- offline sensor → **status UNKNOWN**, not "failed"
- stale rainfall flagged; satellite recorded as unavailable, that evidence plate dropped
- it **cannot** separate rainfall deficit from abstraction or damage remotely → drafts a
  **low-confidence** case that says *"send someone to look"* — not a confident wrong cause
- the Nepali SMS still drafts, and **queues** for approval
- every degradation is in the trace

`Simulate a bad day` in the demo runs exactly this. The handback to a human is the design, not the failure.

---

## 7 · What it takes to be real

| | |
|---|---|
| **Cost per run** | Sweep of 6 springs: **NPR 0.03**. An escalated investigation: **~NPR 7**. A full day for a 200-spring municipality: **~NPR 100 (≈ USD 0.75)**. |
| **Who pays** | The municipality's existing WASH budget, or a WASH-sector programme (ICIMOD / HELVETAS / SNV / Red Cross already fund springshed work by hand). This replaces the *evidence-gathering*, not the hydrogeologist. |
| **The route to users** | Not an app store. It rides the municipality's existing water desk and the municipal water & sanitation section — institutions that already exist and already meet. The SMS reaches the ward office on the handset they already carry. |
| **Breaks at 10,000 springs** | The sweep is linear and cheap. The bottleneck is the shared LLM quota → route more to the fast model, batch the sweep, cache. The Sentinel Hub free tier covers ~100–300 investigations/month; beyond that it is ~USD 0.30 each. |
| **Next 3 months** | (1) One real sensor pilot with one municipality — 10 springs, real telemetry into the same pipeline. (2) One hydrogeologist-verified springshed to benchmark the topographic estimate. (3) Swap ERA5 for gauge/CHIRPS rainfall. (4) IVR/voice for coordinators who don't read comfortably. |

---

## 8 · The ask

**We need, from this room:**
- An introduction to **one rural municipality** in the mid-hills or far-west that will host a
  10-spring sensor pilot — ideally someone from a WASH programme (ICIMOD, HELVETAS, DoLI).
- A **hydrogeologist** willing to verify two springsheds so we can put a real accuracy number
  on the recharge estimate.
- If you fund water or climate resilience: **USD 8–12k** covers the sensor pilot and three
  months of build.

Slide 7 was not hypothetical — the top three teams pitch again at the AI Summit in December.
