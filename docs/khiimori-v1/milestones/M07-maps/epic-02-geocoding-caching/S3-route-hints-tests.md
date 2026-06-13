# S3 — Ordered route hints & tests

## Context
The proxy provides **ordered route hints** for a day's pins so the map can draw an **indicative route**
(PRD §5.6), and epic AC requires tests for cache hit/miss and ordered-route output (PRD §7.6).

## Task
Expose ordered route hints for a day's pins and add the epic's test suite.

## Acceptance criteria
- [ ] Given a day's ordered, located items (geocoded), the proxy returns **route hints** between the pins
  in itinerary order for an indicative route.
- [ ] The route output is suitable for the frontend (Epic 03) to render an indicative path.
- [ ] Integration tests cover **cache hit/miss** (S2) and **ordered-route** output (correct ordering,
  location-less items excluded).
- [ ] Tests use a faked provider (no live Google calls).

## Constraints
- Keep v1 to an **indicative** route (not turn-by-turn) — minimal (PRD §7.0).
- Route hints respect itinerary order from Milestone 04.

## Definition of done
Ordered route hints are produced for a day's pins and cache/route behaviours are covered by green tests.

## Dependencies
S1, S2, Milestone 04 (item order/locations). Consumed by Epic 03; satisfies epic AC4.
