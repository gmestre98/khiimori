# S3 — Budget-line tests

## Context
Epic AC4 requires tests for setting/updating trip-level and per-day budget lines and category validation
(PRD §7.6).

## Task
Add unit + integration tests for budget-line behaviour.

## Acceptance criteria
- [ ] Tests cover setting a **trip-level** line (`day_id = null`) and a **per-day** line.
- [ ] Tests cover the **upsert** behaviour (setting twice updates, not duplicates).
- [ ] Tests cover **category validation** (invalid category rejected) and **EUR-only** amounts.
- [ ] Integration tests run against the migrated `budget.BudgetLine` schema (M01.3 harness).

## Constraints
- Reuse the M01.3 integration harness; hermetic per-test state.
- Drive through endpoints so authorization and upsert are exercised.

## Definition of done
Budget-line setting/updating, upsert, validation, and EUR-only are covered by green tests.

## Dependencies
S1, S2, M01.3 S7 (harness). Satisfies epic AC4.
