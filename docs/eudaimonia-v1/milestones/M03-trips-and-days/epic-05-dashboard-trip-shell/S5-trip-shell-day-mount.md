# S5 — Trip shell & deep-linkable day mount points

## Context
A **trip shell** hosts a per-day view that is **deep-linkable** (trip → day) and provides the mount points
the Planning/Budget/Journal/Maps milestones fill in (PRD §5.1). This defines the navigation structure
later milestones depend on.

## Task
Build the trip shell with routing to a deep-linkable day view and defined extension mount points.

## Acceptance criteria
- [ ] A trip shell route renders a selected trip and navigates to a **per-day view** addressable by a
  **deep link** (e.g. `/trips/:tripId/days/:dayId`) using Epic 02 S4 addressing.
- [ ] The day view defines **stable mount points/slots** for later milestones (planning list, budget
  panel, journal, map) without implementing them.
- [ ] Day navigation (prev/next day, jump to a day) works against the trip's generated days.
- [ ] The shell is responsive and aligns with the navigation model Milestone 09 will style.

## Constraints
- Keep mount points as clean, documented slots so Milestones 04–07 add surfaces without restructuring
  navigation (PRD §7.1).
- Deep links must be shareable/bookmarkable within the authenticated app.

## Definition of done
A deep-linkable day view exists inside a trip shell with defined slots for later milestones; day
navigation works.

## Dependencies
S1, Epic 02 S4 (day addressing). Consumed by Milestones 04–07.
