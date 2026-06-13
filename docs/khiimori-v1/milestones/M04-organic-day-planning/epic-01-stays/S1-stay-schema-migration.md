# S1 — `Stay` schema & migration

## Context
Milestone 04 models accommodation. The `Stay` entity (PRD §9) lives in the `trip.*` schema and spans days
via its check-in/out range (no per-night rows). Its `cost` is a source for Milestone 05's roll-ups.

## Task
Add a migration for the `Stay` table in the `trip.*` schema.

## Acceptance criteria
- [ ] A migration creates `Stay(id, trip_id, name, location, check_in, check_out, cost, link)` with a FK
  to `trip.Trip` and an index on `trip_id`.
- [ ] `name` is required; `location`, `cost`, `link`, and the dates are nullable/optional as appropriate
  (a stay is useful with name + dates).
- [ ] The migration applies cleanly via the M01.3 runner and is covered by the migration test setup.

## Constraints
- Follow M01.3 migration conventions.
- `cost` is owned here; Milestone 05 reads it via the Trip module interface — do not add budget logic.

## Definition of done
The `trip.Stay` table exists; migration applies cleanly.

## Dependencies
M03 Epic 01 S1 (trip schema). Consumed by S2–S3, Milestone 05 (cost), Milestone 07 (location).
