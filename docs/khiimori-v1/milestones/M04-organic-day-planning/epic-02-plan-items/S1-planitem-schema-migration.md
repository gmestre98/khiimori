# S1 — `PlanItem` schema & migration

## Context
The **plan item** is the flexible unit of a day's itinerary (PRD §5.2, §9). It supports a backlog
(`day_id = null`), timed/untimed states, optional fields, an `order`, and a `status` set. This story adds
the table; behaviour is S2–S4.

## Task
Add a migration for the `PlanItem` table in the `trip.*` schema.

## Acceptance criteria
- [x] A migration creates `PlanItem(id, trip_id, day_id?, title, type, start_time?, duration?, location?,
  booking_status?, cost?, link?, order, status)` with FKs to `trip.Trip` and (nullable) `trip.Day`.
- [x] `title` is **required**; all other fields are nullable/optional; `day_id` nullable (backlog).
- [x] `status` is constrained to `idea | planned | done | skipped | cancelled` with a sensible default.
- [x] Indexes support common reads (by `trip_id`, by `day_id`, ordering by `order`).
- [x] The migration applies cleanly via the M01.3 runner.

## Constraints
- Follow M01.3 migration conventions.
- `cost`/`location` are owned here but consumed elsewhere (Milestones 05/07) — no cross-module logic.

## Definition of done
The `trip.PlanItem` table exists with the documented columns/constraints; migration applies cleanly.

## Dependencies
M03 Epic 01 S1 (trip schema), M03 Epic 02 S1 (Day). Consumed by Epics 03–06 and Milestones 05/07.
