# S3 — Field/order preservation & tests

## Context
Promote/demote must preserve the item's other fields (title, cost, link, etc.) and place it sensibly in
the target day's `order` (PRD §5.3). Epic AC requires tests for promote/demote.

## Task
Verify and test field/order preservation across promote/demote.

## Acceptance criteria
- [ ] Promoting then demoting an item leaves all non-`day_id` fields unchanged (title, type, cost, link,
  duration, etc.).
- [ ] On promote, the item appears in the target day's ordered list at a sensible position; on demote it
  returns to the backlog ordering.
- [ ] Integration tests (M01.3 harness) cover promote, demote, and field/order preservation.
- [ ] A test confirms promote/demote do not create or delete rows (same `id` throughout).

## Constraints
- Reuse the M01.3 harness; hermetic per-test state.
- Coordinate the ordering approach with Epic 04 so reorders and promotes converge (shared `order` scheme).

## Definition of done
Promote/demote preserve fields and ordering, proven by green tests; the same row is reused throughout.

## Dependencies
S1, S2, M01.3 S7 (harness). Shares ordering with Epic 04.
