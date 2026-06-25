# S2 — Render pins in itinerary order

## Context
The map shows the day's **stay and located plan items as pins, in itinerary order** (PRD §5.6). Pins use
geocoded coordinates from Epic 02 and ordering from Milestone 04.

## Task
Render pins for the day's stay and located plan items in itinerary order.

## Acceptance criteria
- [x] The map renders a pin for the day's `Stay` (if located) and for each located `PlanItem`
  (activity/transport).
- [x] Pins are ordered by the itinerary `order` (Milestone 04), so their sequence matches the day plan.
- [x] Pin coordinates come from Epic 02's geocoding/cache (server-side), not client geocoding.
- [x] Pins may use restrained accent colour per the minimal theme (PRD §5.10).

## Constraints
- Use server-provided coordinates/order; do not geocode or reorder client-side.
- Keep pin styling minimal and consistent with the theme.

## Definition of done
The day's stay and located plan items render as ordered pins on the map.

## Dependencies
S1 (map component), Epic 02 (geocoding), M04 (item order/locations). Route/omission in S3.
