# S2 — Current-trip dashboard budget glance

## Context
The trip dashboard's **current-trip budget glance** slot (left by Milestone 03 Epic 05 S2) is **populated**
with live figures from Epic 02 (PRD §5.4). This gives an at-a-glance budget read from the home screen.

## Task
Fill the dashboard's current-trip budget-glance slot with live roll-up figures.

## Acceptance criteria
- [ ] The current-trip glance slot renders live **spent vs. planned (vs. remaining)** for the current
  trip, from Epic 02's roll-up API.
- [ ] It uses the stable slot/contract Milestone 03 S2 defined (clean boundary — M03 owns the slot, M05
  the figures).
- [ ] When no current trip / no budget exists, the glance degrades gracefully.
- [ ] It is consistent with the full roll-up display (S1) — same source of truth.

## Constraints
- Fill the existing slot; do not restructure the dashboard (Milestone 03 owns it).
- Keep the glance lightweight (it is a summary, not the full breakdown).

## Definition of done
The dashboard's current-trip budget glance shows live figures and degrades gracefully.

## Dependencies
S1, Epic 02 (roll-up API), Milestone 03 Epic 05 S2 (glance slot).
