# Incident Replay Console

An interactive incident investigation interface that reconstructs a simulated
production outage from timestamped telemetry and discrete events. Entirely
client side with the help of static files.

## Quickstart

```bash
npm install
npm run dev        # dev server
npm test           # unit tests (state, URL codec, filters, fixtures)
npm run build      # typecheck + production bundle in dist/
npm run generate   # regenerate deterministic incident fixtures (dev time only)
```

## What it does

- Select an incident from a small set of pre-generated, deterministic datasets.
- Scrub a synchronized timeline; every chart, the event stream, and the detail
  panel move together.
- Filter events by service / type / severity; zoom and pan the viewed window.
- Inspect individual events and the metric values at the cursor.
- The URL encodes the full investigation state — refresh or share the link and
  the same view is reproduced.
- Keyboard-first: arrow keys scrub (`Shift` = 30s), `+`/`-` or `<`/`>` zoom,
  `Space` plays the timeline, `Home`/`End` jump, `0` resets the window.
- Touch-friendly: drag to scrub, drag the window or its edge handles to pan and
  resize, and a transport bar (step ±30s, play, zoom, reset) mirrors every
  keyboard control with 44px targets.

## Architecture

```
src/
  types.ts              incident / telemetry / event models
  data/incidents/       committed deterministic fixtures (generated, see scripts/)
  lib/
    urlState.ts         ViewState <-> URL query codec (deep-linkable state)
    store.tsx           React context + reducer: single source of truth
    loadIncident.ts     lazy fixture loading + validation
    validate.ts         fixture schema validation (malformed-fixture safety)
    filters.ts          event filtering (pure, tested)
    downsample.ts       bucket-average downsampling for chart performance
    chartData.ts        window-bucketed chart row builder
    format.ts           time formatting helpers
    theme.ts            severity / service color tokens
  components/
    IncidentSelector.tsx incident picker + metadata strip
    Timeline.tsx        custom SVG timeline: scrub, brush window, markers
    Charts.tsx          synchronized Recharts metric panels
    EventStream.tsx     filtered, virtualized-bounded event list
    DetailPanel.tsx     selected event / cursor context panel
scripts/
  generate-fixtures.mjs seeded, deterministic fixture generator (dev-time)
tests/                  vitest: codec, reducer, filters, downsampling, fixtures
```

State flows one way: URL -> store -> components; store changes are written back
to the URL with `history.replaceState`, so any view is shareable.

## Fixtures

Fixtures are **never generated in the browser**. `scripts/generate-fixtures.mjs`
uses a seeded PRNG to produce three incidents (database saturation, worker
failure / queue backlog, bad deploy + rollback) with ~1s telemetry cadence and
realistic causal stories. The generated JSON is committed to the repo, so the
deployed app only downloads compact static data. Regenerating with the same seed
produces byte-identical output (enforced by a test).

