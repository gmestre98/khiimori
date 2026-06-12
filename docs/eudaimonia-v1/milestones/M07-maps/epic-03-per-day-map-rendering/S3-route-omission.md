# S3 — Indicative route & location-less omission

## Context
An **indicative route** is drawn between pins in order (using Epic 02's route hints), and items/stays
**without a location are omitted gracefully** — planning allows location-less items (PRD §5.6, Milestone
04).

## Task
Draw the indicative route and handle location-less items.

## Acceptance criteria
- [ ] An **indicative route** is drawn between the day's pins in itinerary order, using Epic 02 S3 route
  hints.
- [ ] Items/stays **without a location are omitted** from the map (no broken pins), and the route connects
  only located items.
- [ ] When a day has zero located items, the map degrades gracefully (e.g. neutral empty state).
- [ ] UI behaviour is verified for mixed located/location-less days.

## Constraints
- Route is **indicative** only (not turn-by-turn) — minimal (PRD §7.0).
- Omission must be graceful (planning intentionally allows location-less items).

## Definition of done
The map shows an indicative route across located pins and gracefully omits location-less items.

## Dependencies
S1, S2, Epic 02 S3 (route hints). Correlation with items is Epic 04.
