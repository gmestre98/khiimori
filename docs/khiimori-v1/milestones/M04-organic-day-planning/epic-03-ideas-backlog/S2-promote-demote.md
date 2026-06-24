# S2 — Promote & demote (no re-entry)

## Context
**Promote** sets a backlog item's `day_id` (and optionally `start_time`); **demote** clears `day_id` back
to the backlog — both reuse the **same row** with no re-entry (PRD §5.3). This is the spontaneity-first
core.

## Task
Implement promote and demote operations on a plan item.

## Acceptance criteria
- [x] **Promote** sets `day_id` (to a day in the trip) and optionally `start_time`, moving the item from
  backlog to that day — same row.
- [x] **Demote** clears `day_id` (back to backlog), preserving the item — same row.
- [x] Both operations are **authorized** (M03 `Authorizer`) and **idempotent/queueable** for offline
  replay (Epic 06).
- [x] A unit test covers promote and demote round-trips.

## Constraints
- Promote/demote are pure `day_id` (and optional `start_time`) changes — never create/delete-and-recreate
  (PRD §5.3).
- On promote, place the item sensibly in the target day's `order` (final reorder mechanics in Epic 04).

## Definition of done
Ideas can be promoted to a day and demoted back without re-entry; tests green.

## Dependencies
S1, Epic 02 (PlanItem), M03 Epic 04 (authz). Order/field preservation in S3.
