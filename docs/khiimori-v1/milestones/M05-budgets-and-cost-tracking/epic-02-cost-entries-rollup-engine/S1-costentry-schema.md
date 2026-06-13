# S1 — `CostEntry` schema & migration

## Context
Manual costs are captured as `CostEntry` rows (PRD §9): category, amount, note, optional link to a day
and/or plan item. This story adds the table; CRUD is S2 and aggregation is S3.

## Task
Add a migration for the `CostEntry` table in the `budget.*` schema.

## Acceptance criteria
- [ ] A migration creates `CostEntry(id, trip_id, day_id?, plan_item_id?, category, amount, note,
  created_at)` with FKs to trip and (nullable) day / plan item.
- [ ] `category` is constrained to the fixed set (Stays, Transport, Food, Activities, Other); `amount` is
  EUR.
- [ ] Indexes support aggregation reads (by `trip_id`, `day_id`, `category`).
- [ ] The migration applies cleanly via the M01.3 runner.

## Constraints
- Follow M01.3 conventions.
- `plan_item_id`/`day_id` optional — a quick cost may attach to neither, a day, or a specific plan item.

## Definition of done
The `budget.CostEntry` table exists with the fixed categories and optional links; migration applies
cleanly.

## Dependencies
Epic 01 S1 (budget schema), M03/M04 (trip, day, plan item). Consumed by S2–S5.
