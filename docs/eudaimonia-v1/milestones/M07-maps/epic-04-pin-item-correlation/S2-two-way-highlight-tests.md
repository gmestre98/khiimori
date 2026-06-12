# S2 — Two-way highlighting & tests

## Context
**Tapping a pin highlights the matching itinerary item, and selecting an item highlights its pin** — a
two-way link (PRD §5.6). Epic AC requires UI tests for both directions, robust to reordering and
location-less items.

## Task
Implement two-way highlighting on top of the shared selection state and test it.

## Acceptance criteria
- [ ] **Tapping a pin** highlights (scrolls to / emphasises) the matching itinerary item.
- [ ] **Selecting an itinerary item** highlights its pin on the map.
- [ ] Highlighting uses restrained accent colour consistent with the theme (PRD §5.10).
- [ ] UI tests cover both directions, plus robustness to **reordering** and **location-less** items (no
  pin to highlight, no crash).

## Constraints
- Reflect the shared selection state (S1); both surfaces read/write the same state.
- Keep highlight styling minimal and accessible.

## Definition of done
Pin↔item highlighting works in both directions and is covered by green UI tests, robust to reorder and
location-less items.

## Dependencies
S1, Epic 03 (map), M04 (itinerary). Satisfies the epic's quality bar.
