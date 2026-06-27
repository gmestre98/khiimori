# S3 — Navigation primitives

## Context
The library provides **navigation** primitives (PRD §5.10) used by the trip/day shell (Milestone 03) and
the mobile bottom navigation (Epic 03).

## Task
Build the navigation primitives.

## Acceptance criteria
- [x] Navigation primitives support the app's top-level and in-trip navigation (e.g. nav bar, tabs/bottom
  nav, day prev/next).
- [x] They are token-driven and accessible (keyboard navigable, clear focus, semantic landmarks).
- [x] They are responsive-ready so Epic 03 composes them into laptop and mobile layouts.
- [x] They align with Milestone 03's trip/day shell navigation structure.

## Constraints
- Provide the bottom-nav primitive Epic 03 needs for mobile (thumb-reachable).
- Keep accessible navigation a first-class concern (Epic 05 validates).

## Definition of done
Reusable, accessible navigation primitives exist for the shell and mobile layouts.

## Dependencies
Epic 01 (tokens), Milestone 03 (shell nav structure). Composed by Epic 03; documented in S4.
