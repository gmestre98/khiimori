# S4 — Day addressability & generation tests

## Context
Days must be **addressable for deep-linking** (trip → day) to support Planning/Journal/Maps, and epic AC4
requires tests for generation on range edits including single-day and shrink-with-data cases (PRD §5.1,
§7.6).

## Task
Expose day addressing (read a day by trip + date/index or by id) and add integration tests for generation.

## Acceptance criteria
- [x] A day is addressable via a stable identifier (its `id`, and/or `trip_id` + `date`/`index`) and
  readable through an endpoint the later day surfaces can deep-link to.
- [x] Integration tests (M01.3 harness) cover: create generates one-per-date, extend adds, shrink-empty
  removes, shrink-with-data is guarded, and single-day trips.
- [x] Tests assert `index` stability and real-date mapping across edits.

## Constraints
- Reuse the M01.3 integration harness; hermetic per-test state.
- Addressing must be consistent for web and mobile (server-derived).

## Definition of done
Days are deep-linkable and the generation behaviours are covered by green integration tests.

## Dependencies
S1–S3, M01.3 S7 (harness). Satisfies epic AC4; consumed by Milestones 04–07 deep-links.
