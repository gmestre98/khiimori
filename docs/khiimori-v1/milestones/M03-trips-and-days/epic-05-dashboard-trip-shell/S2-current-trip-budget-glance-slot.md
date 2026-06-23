# S2 — Current-trip prominence & budget-glance slot

## Context
The **current trip is surfaced prominently**, showing **today's day number** and a **budget-progress
glance** slot — the figures are provided later by Milestone 05; this epic renders the slot (PRD §5.1).
Builds on the dashboard (S1) and the current-trip flag from Epic 03.

## Task
Render a prominent current-trip surface with today's day number and a budget-glance placeholder slot.

## Acceptance criteria
- [x] When a current trip exists (flagged by Epic 03), it is surfaced **prominently** above/within the
  dashboard.
- [x] It shows **today's day number** (derived from the trip's days / today).
- [x] It renders a **budget-glance slot** as a defined placeholder/component boundary that Milestone 05
  fills with real figures — no budget math here.
- [x] When no current trip exists, the surface degrades gracefully (hidden or a neutral prompt).

## Constraints
- Own the **layout slot**, not the budget figures (clean boundary, PRD §7.1) — expose a stable
  component/prop contract for Milestone 05.
- Today's day number is computed from server-provided day data, consistent across clients.

## Definition of done
The current trip is prominent with today's day number and a budget-glance slot ready for Milestone 05.

## Dependencies
S1, Epic 02/03 (days, current-trip flag). Slot filled by Milestone 05 Epic 04.
