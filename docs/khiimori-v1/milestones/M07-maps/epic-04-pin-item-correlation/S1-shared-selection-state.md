# S1 — Shared selection/highlight state

## Context
The map and itinerary share a **selection/highlight state** so a pin and its matching item can highlight
each other (PRD §5.6). Pins and items correlate by a stable id (`PlanItem`/`Stay` id).

## Task
Introduce a shared selection state correlating pins and itinerary items by id.

## Acceptance criteria
- [x] A shared selection state holds the currently highlighted entity id, accessible to both the map
  (Epic 03) and the day list (Milestone 04).
- [x] Pins and items are correlated by a **stable identifier** (`PlanItem`/`Stay` id), robust to
  reordering and promote/demote (Milestone 04).
- [x] Setting the selection from either side updates the shared state.
- [x] Location-less items (no pin) are handled (selectable in the list, simply no pin to highlight).

## Constraints
- Correlate by id, not by index/position (so reordering doesn't break the link).
- Keep the state lightweight and local to the day view (no global store needed).

## Definition of done
A shared, id-correlated selection state links map pins and itinerary items.

## Dependencies
Epic 03 (map/pins), M04 Epic 05 (day list). Highlighting in S2.
