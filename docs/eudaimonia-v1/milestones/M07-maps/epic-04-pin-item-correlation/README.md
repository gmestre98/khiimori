# Epic M07.4 — Two-way pin↔item correlation (frontend)

> Milestone: [07 — Maps](../README.md) · PRD refs: §5.6, §5.10, §7.2.

## Description

Connect the map and the itinerary: **tapping a pin highlights the matching itinerary item**, and
**selecting an item highlights its pin** — a two-way link that makes the map a navigation aid for
the day, not just a picture. Builds directly on the per-day rendering from Epic 03.

**Estimated effort:** ~1 developer-day (one developer).

## Acceptance Criteria

- [ ] **Tapping a pin highlights the matching itinerary item** (scrolls to / emphasises it)
      (PRD §5.6).
- [ ] **Selecting an itinerary item highlights its pin** on the map (two-way) (PRD §5.6).
- [ ] Correlation is robust to location-less items (which have no pin) and to itinerary reordering
      from Milestone 04; UI tests cover both directions of highlighting (PRD §5.6, §7.6).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), extending Epic 03's map and Milestone
  04's day list with a shared selection/highlight state.
- Pins and items are correlated by a stable identifier (the `PlanItem`/`Stay` id), so reordering or
  promoting/demoting items (Milestone 04) keeps the link correct.
- Highlighting uses restrained accent colour consistent with the minimal theme (PRD §5.10).

## Dependencies

- **Upstream:** Epic 03 (per-day map rendering), Milestone 04 (itinerary list + item ids).
- **Downstream:** Milestone 10 (map interaction in the day journey); Milestone 09 polishes the
  highlight styling.

## Costs Impact

None — pure client-side interaction over already-loaded map/itinerary data (PRD §8.1).

## Designs

Pin↔item correlation in the day plan:
[assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2, §5.10).
