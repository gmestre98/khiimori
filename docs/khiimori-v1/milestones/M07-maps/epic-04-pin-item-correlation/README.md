# Epic M07.4 — Two-way pin↔item correlation (frontend)

> **Status:** ✅ Done — [PR #332](https://github.com/gmestre98/khiimori/pull/332) (S1), [PR #333](https://github.com/gmestre98/khiimori/pull/333) (S2). All 3 ACs met: tapping a pin highlights the matching item, selecting an item highlights its pin, correlation is robust to location-less items and reordering with UI tests for both directions.

> Milestone: [07 — Maps](../README.md) · PRD refs: §5.6, §5.10, §7.2.

## Description

Connect the map and the itinerary: **tapping a pin highlights the matching itinerary item**, and
**selecting an item highlights its pin** — a two-way link that makes the map a navigation aid for
the day, not just a picture. Builds directly on the per-day rendering from Epic 03.

**Estimated effort:** ~1 developer-day (one developer).

## Acceptance Criteria

- [x] **Tapping a pin highlights the matching itinerary item** (scrolls to / emphasises it)
      (PRD §5.6).
- [x] **Selecting an itinerary item highlights its pin** on the map (two-way) (PRD §5.6).
- [x] Correlation is robust to location-less items (which have no pin) and to itinerary reordering
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

## User stories

The epic is split into **2 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-shared-selection-state.md) | Shared selection/highlight state | ~2.5h | AC1, AC2 | Epic 03, M04 Epic 05 |
| [S2](S2-two-way-highlight-tests.md) | Two-way highlighting & tests | ~3h | AC1, AC2, AC3 | S1 |

**Total:** ~5.5h (≈ 1 dev-day), consistent with the epic's ~1 dev-day estimate.

### Sequencing

```
S1 Shared selection state ── S2 Two-way highlighting & tests
```

This completes the per-epic story breakdown for **Milestone 07 (4 epics)**.
