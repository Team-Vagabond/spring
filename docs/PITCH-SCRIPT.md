# Naula — 6-minute pitch script + Q&A prep

One person drives (laptop, demo). One person talks. Rehearse twice against a clock.

---

## The script (~5:45, leaves margin)

**[0:00 — 0:40] The person**

"This is a spring in Darchula — a *naula*. A whole ward drinks from it. For two years it's been
giving about a quarter less water. Nobody who could do anything about it knows why — because
finding out means a hydrogeologist, a GIS person, rainfall records from Kathmandu, and a two-day
trek. For this spring, that has never happened. It just slowly goes dry, and one monsoon it
doesn't come back."

**[0:40 — 1:15] Who, and the gap**

"The person who *should* catch this is Ranju — the water focal person at the municipality office.
One desk. Part-time on water. No GIS training. Responsible for two hundred springs she will never
visit. Right now she finds out from a complaint, months late, and she has no way to tell which of
the two hundred is worst. There's a desk exactly like Ranju's in every one of Nepal's 753 local
governments."

**[1:15 — 1:45] What Naula does**

"Naula watches every sensor on a schedule. The moment one is genuinely declining — not a wet-week
wobble, a real sustained drop — an agent investigates on its own. Rainfall. Where the water comes
from, traced across the terrain. What's changed in that area, then versus now, by satellite. It
weighs the possible causes against each other, and it hands Ranju a finished case with an SMS
brief in Nepali. It never sends anything itself. Let me show you."

**[1:45 — 3:45] Demo** *(this is the pitch — do not rush it)*

- Watch log → **Run scheduled sweep now**. "This endpoint is normally hit by cron. Six springs,
  checked on the cheap model, three paisa." Two escalate.
- Open **Khalanga Mul Dhara**. "This is the agent's transcript — deliverable two."
  - *"It started itself — 'threshold crossed on scheduled sweep'."*
  - *"It's choosing which tool to call. We didn't script this order — run it again and it's different."*
  - *"Here — the satellite service 504'd. It retried and got the data. That's not staged, that
    service really does fall over."*
  - *"It's keeping a running belief on each cause — rainfall goes 30, 45, 60 percent as evidence lands."*
  - *"And here it stops. 'Human approval required.' It will not send the SMS or file the case."*
- Scroll the case. "Most likely cause, sixty percent confidence — it says sixty, not a hundred.
  Every hypothesis has what supports it *and* what argues against it. Here's the recharge area it
  traced. Here's the same ground in 2019 and now — drag it. Twenty-five years of rainfall."
- **Approve.** "Now it acts. SMS to the ward office and the municipal water section — in
  Nepali. Case filed. That line in the trace — ACTION — that's the only thing that left the building,
  and a human released it."

**[3:45 — 4:20] How it works**

"Cron sweep on the fast model. A bounded loop — hard cap at twelve steps, then it asks a human,
so it can't run away on a shared key. Six tools, three of them live external APIs — Copernicus,
Open-Meteo, an elevation model. Fast model for the routine ninety percent, gpt-5.5 only when the
causes actually compete. Every call is metered. Every step is logged."

**[4:20 — 5:00] The bad day**

"The week the rain doesn't stop. Cloud kills the satellite. The sensor's underwater. The key's
rate-limited. Naula doesn't bluff. Sensor offline means *unknown*, not *failed*. It drops the
satellite evidence, flags the stale rainfall, and because it genuinely can't tell rain from a
broken pipe without a field visit, it writes a low-confidence case that says *go and look* — not
a confident wrong answer. The SMS still drafts; it just waits. The handoff to a human is the
design."

**[5:00 — 5:45] Real, and the ask**

"A full day of monitoring for two hundred springs costs about a dollar. It rides the water desk
and the committee that already exist — no app store. What we need from this room: an introduction
to one municipality that'll host a ten-spring sensor pilot, a hydrogeologist to verify two
springsheds so we can put a real accuracy number on the recharge trace, and if you fund water
resilience, twelve thousand dollars covers the pilot and three months. Thank you."

---

## Q&A prep — the brief says every team gets at least two of these

**"What did the model decide that you did not hardcode?"**
The entire investigation path. We give it a goal and six tools. It chose to check the sensor,
then flow history, then rainfall, then map the catchment, then satellite — and it chose to *stop*
("another remote test won't change the ranking"). The escalation *threshold* is code; everything
after it is the model. Two runs of the same spring produce different tool orders — we can show it.

**"What happens on the second run?"**
Per-spring memory persists in Postgres — previous cases, previous readings, whether a past
intervention was ever approved. The seasonal baseline is computed from the spring's own history,
so it gets sharper over time. The agent also won't re-open a case that's already awaiting approval.

**"What does one run cost?"**
The sweep: NPR 0.03 for six springs. An escalated investigation: NPR 5–9, mostly gpt-5.5. It's on
every case page and in the trace. Prices are public list-price — the hackathon endpoint is free,
so we priced it as if it ran on real infrastructure.

**"Who did you speak to?"**
[Fill in with anyone you interview at the event — a WASH-sector person, someone from a
municipality, anyone who's done springshed work. Name them. If nobody: say so, and say the user
model is drawn from the ICIMOD/ACWADAM springshed methodology and the DHARA programme's field
reports.]

**"What is mocked?"**
The flow sensors — there are none deployed. The flow history is a seasonal model plus a
per-spring decline scenario; the decline is real in the numbers and the maths really detects it,
but we wrote the numbers and chose which springs decline. The SMS gateway writes to a table
instead of calling Sparrow SMS. One transient failure in the satellite tool is injected so the
retry is always visible. Everything geospatial — the imagery, the DEM, the rainfall — is live.

**"What would you never let it do on its own?"**
File a formal case with a government committee, or send a message to a citizen or an official.
Both are consequential and hard to walk back. The agent drafts them; a human at the water desk
releases them. That's the `request_dispatch` tool and the `/decision` endpoint — you saw it block.

**"How accurate is the recharge area?"**
As a *surface* catchment from a 30 m DEM, the technique is well-validated — the divide is usually
within one or two cells. As a *spring's* recharge area it's a first guess: real springsheds follow
geology and can sit across a ridge. We label it a topographic estimate everywhere, the agent
lowers its confidence for it, and benchmarking it against a verified springshed is item two on
our next-three-months list.

**"Your agent is only useful when a spring is failing — most days nothing happens."**
Right — and most days it costs three paisa and produces nothing, which is correct behaviour. The
value is that it covers *all* two hundred springs *every* day, so the one that's failing gets
caught in days instead of the months it takes a complaint to travel.

**"If the API goes down mid-demo?"**
We switch to the 60-second video. And functionally — that's the bad day. The sweep completes on
the deterministic fallback and the investigation degrades to the honest low-confidence case. We
can show that on purpose with "Simulate a bad day".
