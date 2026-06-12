# S2 — Performance techniques (code-splitting, lazy maps, thumbnails)

## Context
The performance budget targets the **day view interactive < 1.5s on a mid-range phone on 4G** (PRD §6),
hit via **code-splitting**, **lazy-loaded maps** (Milestone 07), and **light thumbnails** (Milestone 06) —
choices that also cut the two named variable-cost risks (PRD §8.4 #2–3).

## Task
Apply the performance techniques across the app.

## Acceptance criteria
- [ ] **Code-splitting** is in place so the day view loads only what it needs (routes/components split).
- [ ] The **map is lazy-loaded** (Milestone 07 S1) — not on initial app/day load.
- [ ] List/grid views serve **light thumbnails** (Milestone 06 S3), not originals.
- [ ] Bundle/asset sizes for the critical path are kept lean (measured).

## Constraints
- These techniques double as cost mitigations (fewer Maps calls, less photo egress) — apply them
  deliberately (PRD §8.4).
- Coordinate with Milestone 07 (lazy map) and Milestone 06 (thumbnails) — reuse, don't duplicate.

## Definition of done
Code-splitting, lazy maps, and thumbnails are applied so the day view's critical path is lean.

## Dependencies
Milestone 07 (lazy map), Milestone 06 (thumbnails), Epics 01–04. Measured in S3.
