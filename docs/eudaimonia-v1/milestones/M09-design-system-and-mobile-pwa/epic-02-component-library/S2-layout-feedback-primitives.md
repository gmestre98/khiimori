# S2 — Layout & feedback primitives (lists, sheets, progress bars)

## Context
The library provides **lists, sheets/drawers, and progress bars** (PRD §5.10) — the building blocks for
the day view (Milestone 04 sheets), budget bars (Milestone 05), and photo usage indicators (Milestone 06).

## Task
Build the layout/feedback primitives.

## Acceptance criteria
- [ ] **List** primitives (rows, sections) support the trip/plan/journal lists.
- [ ] **Sheet/drawer** primitives support quick add/edit on mobile (Milestone 04).
- [ ] **Progress bar** primitives support budget bars and usage indicators, using the accent token where
  sanctioned (Milestone 05/06).
- [ ] All are token-driven and accessible (focus, semantics).

## Constraints
- Design sheets for thumb-reachable mobile use (Epic 03 will compose them into the mobile layout).
- Reuse Epic 01 tokens; accent only where sanctioned (status, budget bars).

## Definition of done
Reusable, accessible list/sheet/progress primitives exist for the feature epics that need them.

## Dependencies
Epic 01 (tokens). Consumed by Milestones 04/05/06; documented in S4.
