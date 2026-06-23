# S4 — Plan-item CRUD & timed/untimed tests

## Context
Epic AC5 requires tests for create-with-title-only, timed/untimed toggling, and full CRUD (PRD §7.6).
Plan items are the core planning unit, so the contract is covered against a real schema.

## Task
Add unit + integration tests for plan-item CRUD and timed/untimed behaviour.

## Acceptance criteria
- [x] Tests cover **create with only a title** (other fields null/defaulted).
- [x] Tests cover **timed vs untimed** (null vs set `start_time`) including toggling via edit.
- [x] Tests cover edit (partial), delete, and authorization (unauthorized denied).
- [x] Integration tests run against the migrated `trip.PlanItem` schema (M01.3 harness).

## Constraints
- Reuse the M01.3 integration harness; hermetic per-test state.
- Assert behaviour through endpoints/service so offline-replay-safety isn't broken later.

## Definition of done
Plan-item CRUD and timed/untimed semantics are covered by green unit + integration tests.

## Dependencies
S1–S3, M01.3 S7 (harness). Satisfies epic AC5.
