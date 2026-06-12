# S3 — Edit & delete plan items

## Context
Each optional field is independently editable, and items can be deleted (PRD §5.2). `status` transitions
and reorder/move are Epic 04; this story covers field edits and deletion.

## Task
Implement edit and delete for plan items.

## Acceptance criteria
- [ ] An edit endpoint updates any subset of fields (title, type, time/duration, location, booking status,
  link, cost) independently.
- [ ] Setting/clearing `start_time` toggles timed/untimed correctly.
- [ ] A delete endpoint removes a plan item (and is safe/idempotent for offline replay).
- [ ] Edit/delete are **authorized** via the M03 `Authorizer`.
- [ ] A unit test covers partial edits, timed↔untimed toggling, and delete.

## Constraints
- Keep mutations idempotent/queueable (Epic 06).
- Do not implement reorder/move/status-set here — that is Epic 04 (note the boundary).

## Definition of done
Plan items can be edited field-by-field and deleted, authorized and replay-safe; tests green.

## Dependencies
S1, S2, M03 Epic 04 (authz). Reorder/move/status in Epic 04.
