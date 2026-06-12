# S2 — Move item to another day

## Context
An item can be **moved to another day** (drag or a "move to day" action), changing its `day_id` and placing
it in the target day's order — reusing the same row (PRD §5.3). This shares mechanics with promote
(Epic 03).

## Task
Implement moving a plan item between days.

## Acceptance criteria
- [ ] A move operation changes an item's `day_id` to another day in the trip and inserts it into that
  day's `order` sensibly.
- [ ] The same row is reused (no delete/recreate); other fields are preserved.
- [ ] Move is **authorized** (M03 `Authorizer`) and **idempotent/queueable** for offline replay.
- [ ] A unit test covers moving an item between days and order placement in the target.

## Constraints
- Reuse the ordering scheme from S1 and the `day_id`-change mechanics shared with Epic 03 promote/demote.
- Moving a timed item keeps its `start_time` unless explicitly changed.

## Definition of done
Items can be moved between days, reusing the row and ordering sensibly; tests green.

## Dependencies
S1 (ordering), Epic 02 (PlanItem), Epic 03 (shared day_id mechanics), M03 Epic 04 (authz).
