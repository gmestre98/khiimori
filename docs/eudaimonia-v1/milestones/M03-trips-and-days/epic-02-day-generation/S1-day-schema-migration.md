# S1 — `Day` schema & migration

## Context
Each trip's days are derived from its date range (PRD §5.1). The `Day` entity (PRD §9) is addressable by
later milestones (planning, budgets, journal, maps). This story adds the table; generation logic is
S2–S3.

## Task
Add a migration for the `Day` table in the `trip.*` schema.

## Acceptance criteria
- [ ] A migration creates `Day(id, trip_id, date, index, notes)` with a FK to `trip.Trip` and an index
  on `trip_id` (and a uniqueness guard on `(trip_id, date)`).
- [ ] `date` is a real calendar date; `index` gives a stable within-trip order.
- [ ] The migration applies cleanly via the M01.3 runner and is covered by the migration test setup.

## Constraints
- Follow M01.3 migration conventions.
- `(trip_id, date)` uniqueness prevents duplicate days for a date (supports idempotent generation in S2).

## Definition of done
The `trip.Day` table exists with a per-date uniqueness guard; migration applies cleanly.

## Dependencies
Epic 01 S1 (trip schema). Consumed by S2–S4 and Milestones 04–07.
