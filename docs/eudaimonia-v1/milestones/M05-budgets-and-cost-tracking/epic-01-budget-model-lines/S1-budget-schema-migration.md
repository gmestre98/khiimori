# S1 — `budget.*` schema & `BudgetLine` migration

## Context
Milestone 05 introduces budgets. Per schema-per-module (PRD §7.7), the `budget` module owns the
**`budget.*`** schema. `BudgetLine` (PRD §9) holds a planned amount per category at trip or day level.

## Task
Add a migration creating the `budget` schema and the `BudgetLine` table.

## Acceptance criteria
- [ ] A migration creates the **`budget`** schema and `BudgetLine(id, trip_id, day_id?, category,
  planned_amount, actual_amount)` with FKs to `trip.Trip` and (nullable) `trip.Day`.
- [ ] `category` is constrained to the fixed set **Stays, Transport, Food, Activities, Other**.
- [ ] `day_id = null` represents a **trip-level** budget; otherwise **per day**. A uniqueness guard
  prevents duplicate lines for the same `(trip_id, day_id, category)`.
- [ ] The migration applies cleanly via the M01.3 runner.

## Constraints
- Follow M01.3 migration conventions.
- `actual_amount` exists but is maintained by Epic 02's roll-up engine — not set here.

## Definition of done
The `budget.BudgetLine` table exists with the fixed category set and trip/day distinction; migration
applies cleanly.

## Dependencies
M03 Epics 01/02 (trip, day). Consumed by S2–S3 and Epic 02.
