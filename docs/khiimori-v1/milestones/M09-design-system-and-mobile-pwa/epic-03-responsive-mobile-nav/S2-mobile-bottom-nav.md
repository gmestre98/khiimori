# S2 — Mobile bottom navigation & thumb zones

## Context
The mobile layout uses **bottom navigation** and places **primary actions in thumb-reachable zones** with
large tap targets (PRD §5.10). This directly enables fast spontaneous re-planning (Milestone 04).

## Task
Implement the mobile bottom navigation and thumb-zone action placement.

## Acceptance criteria
- [ ] A **bottom navigation** bar provides the app's primary mobile navigation (using Epic 02 nav
  primitives).
- [ ] Primary actions are placed in **thumb-reachable zones** with large tap targets.
- [ ] The bottom nav integrates with Milestone 03's navigation structure and the responsive system (S1).
- [ ] On laptop, navigation uses the comfortable layout (no bottom nav forced where inappropriate).

## Constraints
- Mobile-first interaction model (PRD §5.3, §5.10) — thumb reach is a primary concern.
- Reuse Epic 02 navigation primitives.

## Definition of done
The mobile layout has bottom navigation and thumb-reachable primary actions.

## Dependencies
S1 (responsive system), Epic 02 S3 (nav primitives), Milestone 03 (nav structure). Sheets in S3.
