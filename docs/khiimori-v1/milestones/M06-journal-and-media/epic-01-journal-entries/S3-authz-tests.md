# S3 — Authorization & entry tests

## Context
Journal reads/writes pass the Sharing module's server-side check so an entry is only visible to owner +
invited members (PRD §5.9, §6), and epic AC requires tests for one-per-day, optional fields, and author
capture (PRD §7.6).

## Task
Wire journal entries through the trip `Authorizer` and add the test suite.

## Acceptance criteria
- [x] All journal read/write paths call the trip `Authorizer` (M03 Epic 04 shim, later Milestone 08) —
  only owner + invited members may access; unauthorized → 403/404.
- [x] Integration tests (M01.3 harness) cover one-per-day enforcement, optional fields, and `author_id`
  capture.
- [x] A test covers an unauthorized user being denied read/write of an entry.
- [x] Tests assert author is the session user (supports an Editor companion journaling on a shared trip).

## Constraints
- Reuse the trip `Authorizer`; do not inline access rules (PRD §5.9).
- Reuse the M01.3 integration harness; hermetic state.

## Definition of done
Journal entries are authorized server-side and the entry behaviours are covered by green tests.

## Dependencies
S1, S2, M03 Epic 04 (authz), M01.3 S7 (harness). Satisfies the epic's quality bar.
