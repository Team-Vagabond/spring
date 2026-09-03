# Naula — design system

**Concept: the case file.** Naula is not a dashboard, it's an investigator. The machine does
its work in the dark (a telemetry console — green-black, mono, terrain), and hands the human a
clean field report (warm paper, a natural-history plate for each piece of evidence). The tension
between those two surfaces *is* the product.

**Signature: the contour line.** A single hairline that behaves like a topographic contour —
the spine of the watch log, the divider between report plates, the styling of the recharge
polygon, and the establishing gesture on load (it draws itself). It encodes the core science:
reading water through terrain.

## Palette

| token | hex | role |
|---|---|---|
| `--ink` | `#0B1512` | canvas — wet-slate green-black (not blue-black) |
| `--ink-2` / `--ink-3` | `#0F1B17` / `#16241E` | raised panel / hover on dark |
| `--hairline` | `#26332C` | borders on dark |
| `--paper` | `#F1ECE0` | the report surface — warm limestone / field notebook |
| `--paper-line` | `#D5CBB4` | rules on paper |
| `--water` | `#4FA8AB` | primary — Himalayan spring teal over pale stone |
| `--moss` | `#8AA84B` | vegetation / healthy — the colour NDVI measures |
| `--ochre` | `#CC8542` | built-up / caution — the colour NDBI measures, far-west soil |
| `--clay` | `#B0483A` | decline / alarm — earthen terracotta, not neon |

Semantics are drawn from the instruments: moss = the vegetation index, ochre = the built-up
index, clay = the drying spring. They are not arbitrary status colours.

## Type

- **Fraunces** (display serif, opsz) — page titles, the finding, big measured numbers. Used with
  restraint. Reads as "written by a person, in a notebook."
- **IBM Plex Sans** — all UI text. The engineered, instrument-panel register.
- **IBM Plex Mono** — coordinates, sensor IDs, metric values. The "measured" numbers.

Fraunces + Plex is a considered pairing: a 19th-century natural-history survey serif against a
neutral technical sans.

## Motion

All motion is **CSS + IntersectionObserver** — no animation library. (framer-motion / `motion`
was tried and removed: it caused a production main-thread hang on this Next 15 / React 19 setup
and added ~47 kB. The hand-rolled `Reveal`, `CountUp`, `Meter`, `LazyMount` primitives in
`components/ui.tsx` cover everything.)

- Station rail: staggered `stagger-in` keyframe via `animation-delay`.
- Dossier: `Reveal` (IO) fades + rises each section once; `CountUp` (rAF) on key numbers.
- Map: `fitBounds` once on load; `flyTo` only when the selected station changes.
- The before/after satellite wipe (`CompareSlider`) is a deliberate interaction, not decoration.
- Recession-curve loader — the exponential-decay shape of a drying spring.
- `prefers-reduced-motion` fully respected (global media query + `CountUp` guard).

## Run for a demo / pitch

`npm run build && npm run start` — production is smooth and stable. `npm run dev` uses webpack
(not turbopack) and `reactStrictMode:false` (react-leaflet + StrictMode double-mount).

## Screens

1. **The network** (`/`) — full-bleed terrain map + a slim station rail you can navigate.
2. **The watch log** (`/signals`) — a timeline of the agent's judgements down a contour spine.
3. **Open cases** (`/escalated`) — dossier tabs, one per escalated spring.
4. **The dossier** (`/escalated/[id]`) — the field report. Three evidence plates + weighed
   hypotheses + next steps. The signature page.
