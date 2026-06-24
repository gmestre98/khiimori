# S3 — Re-planning affordances (drag / move / promote / status)

## Context
The day view exposes **drag-reorder, move-to-day, promote/demote, and status** affordances backed by
Epics 03–04 (PRD §5.3). These make re-planning fast and tactile.

## Task
Wire the re-planning gestures/controls to the Epic 03–04 operations.

## Acceptance criteria
- [x] **Drag-reorder** within a day calls the reorder operation (Epic 04 S1) and updates the view.
- [x] **Move-to-day** (drag or a "move to day" control) calls the move operation (Epic 04 S2).
- [x] **Promote/demote** between backlog and day calls Epic 03 S2.
- [x] **Status** controls mark items done/skipped/cancelled (Epic 04 S3) with the visual reflected.
- [x] Interactions work on web and are usable on mobile (touch drag or equivalent control).

## Constraints
- Reflect the server-confirmed order/state (optimistic UI is fine but reconcile with the server/offline
  queue).
- Provide non-drag equivalents (menus/controls) for accessibility and mobile.

## Definition of done
Reorder, move, promote/demote, and status are all operable from the day view and reflect immediately.

## Dependencies
S1, S2, Epic 03 S2 (promote/demote), Epic 04 (reorder/move/status).
