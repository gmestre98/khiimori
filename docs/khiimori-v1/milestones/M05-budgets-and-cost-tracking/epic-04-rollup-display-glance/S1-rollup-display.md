# S1 — Roll-up display (spent / planned / remaining)

## Context
Roll-ups display **spent vs. planned vs. remaining** at **three levels** — per day, per category, and per
whole trip — each with a **simple progress indicator** (PRD §5.4). Reads Epic 02's roll-up API.

## Task
Build the roll-up display showing the three-level figures with progress indicators.

## Acceptance criteria
- [x] The display shows **spent / planned / remaining** at **per-day**, **per-category**, and **per-trip**
  levels from Epic 02's roll-up API.
- [x] Each level has a **simple progress indicator** (e.g. a bar) using restrained accent colour
  (PRD §5.10).
- [x] No aggregation is done client-side — the server is the source of truth (consistent across clients).
- [x] The display is responsive (web + mobile); Milestone 09 components when available.

## Constraints
- Render server figures; do not recompute totals in the client.
- Use restrained accent for bars per the minimal theme.

## Definition of done
Spent/planned/remaining render at all three levels with progress indicators from the roll-up API.

## Dependencies
Epic 02 (roll-up API), M03/M04 (trip/day shell + day view). Dashboard glance in S2.
