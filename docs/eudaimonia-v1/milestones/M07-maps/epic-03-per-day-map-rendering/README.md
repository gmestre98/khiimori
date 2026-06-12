# Epic M07.3 — Per-day map rendering (frontend)

> Milestone: [07 — Maps](../README.md) · PRD refs: §5.6, §5.10, §7.2, §8.4.

## Description

Render the **per-day map** in the web app: pins for the day's `Stay` and located `PlanItem`s
(activities/transport) in **itinerary order**, with an **indicative route** between them. Items and
stays **without a location are omitted gracefully** (planning allows location-less items). All map
data/tiles come from the **Geo proxy** — the client never holds a Maps key.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] The day view renders a **map with pins** for that day's `Stay` and located `PlanItem`s in
      **itinerary order** (PRD §5.6).
- [ ] An **indicative route** is drawn between the pins in order, using the route hints from Epic 02
      (PRD §5.6).
- [ ] Items/stays **without a location are omitted** from the map gracefully (no broken pins)
      (PRD §5.6, Milestone 04).
- [ ] The client obtains all map data/tiles via the **Geo proxy** and holds **no Maps key**; the map
      is mobile-first, responsive, and **lazy-loaded** to protect performance and cost (PRD §5.6,
      §8.4, §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), rendered within Milestone 04's day view
  / Milestone 03's trip shell.
- Pins consume locations from `Stay`/`PlanItem` (Milestone 04) via geocoded coordinates from Epic 02;
  ordering follows the itinerary `order`.
- The map is **lazy-loaded** (loaded when the day view needs it) to hit the performance budget and
  avoid unnecessary Maps calls (PRD §6, §8.4 #2) — coordinated with Milestone 09.

## Dependencies

- **Upstream:** Epics 01–02 (proxy, geocoding, route hints), Milestone 04 (located stays/plan items),
  Milestone 03 (day view shell).
- **Downstream:** Epic 04 (pin↔item correlation builds on this rendering), Milestone 10 (maps in the
  day journey).

## Costs Impact

Negligible direct cost — static assets on Firebase Hosting free tier; **lazy-loading the map** reduces
Maps calls (PRD §8.4 #2, §8.1).

## Designs

Day plan with map and pins:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2). Pins may use restrained
accent colour (PRD §5.10).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-map-component.md) | Map component (proxy data, lazy-loaded, no client key) | ~3.5h | AC4 | Epic 01 S4, M04 Epic 05 |
| [S2](S2-pins-itinerary-order.md) | Render pins in itinerary order | ~3h | AC1 | S1, Epic 02, M04 |
| [S3](S3-route-omission.md) | Indicative route & location-less omission | ~2.5h | AC2, AC3 | S1, S2, Epic 02 S3 |

**Total:** ~9h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Map component (lazy, no key) ── S2 Pins in order ── S3 Indicative route & omission
```
