# S3 — Multi-night spanning & tests

## Context
A **multi-night stay is entered once and shown across the nights it covers** — derived from its
`[check_in, check_out)` range rather than per-day duplication (PRD §5.2). Epic AC requires tests for
multi-day spanning.

## Task
Expose a stay's coverage across days and add tests for spanning and CRUD.

## Acceptance criteria
- [ ] A day's read includes the stay(s) whose `[check_in, check_out)` range covers that date, derived at
  read time (no duplicate rows per night).
- [ ] Editing a stay's dates updates which days it appears on, with no data duplication.
- [ ] Unit + integration tests cover: a stay shown on each covered day, a single-night stay, and date-edit
  changing coverage.
- [ ] Tests also cover add/edit/remove against a real migrated schema (M01.3 harness).

## Constraints
- Coverage is computed from the range; do not materialise per-night rows.
- Use a clear half-open convention (`[check_in, check_out)`) and document it.

## Definition of done
A multi-night stay appears on each covered day from a single row; spanning and CRUD are covered by green
tests.

## Dependencies
S1, S2, M01.3 S7 (harness). Day rendering consumed by Epic 05.
