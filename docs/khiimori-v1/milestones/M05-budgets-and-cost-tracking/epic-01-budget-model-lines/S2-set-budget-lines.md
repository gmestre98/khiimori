# S2 — Set/update budget lines (trip & per-day, EUR)

## Context
A `planned_amount` can be set **per category** at **trip level** (`day_id = null`) and/or **per day**, in
EUR with no currency selector (PRD §5.4, §11.5). Builds on the schema (S1).

## Task
Implement endpoints to set/update budget lines at trip and day level.

## Acceptance criteria
- [x] An endpoint sets/updates a `planned_amount` for a `(trip, category)` (trip-level) and for a
  `(trip, day, category)` (per-day).
- [x] Categories are validated against the fixed set; invalid categories are rejected.
- [x] Amounts are **EUR** only (no currency field/selector).
- [x] Operations are **authorized** via the M03 `Authorizer`.
- [x] A unit test covers setting trip-level and per-day lines and category validation.

## Constraints
- Upsert semantics on `(trip_id, day_id, category)` so setting a budget twice updates rather than
  duplicates.
- No actual-spend computation here (Epic 02).

## Definition of done
Budget lines can be set/updated at trip and day level in EUR, authorized; tests green.

## Dependencies
S1, M03 Epic 04 (authz). Consumed by Epics 03–04; actuals by Epic 02.
