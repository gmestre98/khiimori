# S5 — Roll-up & aggregation tests

## Context
Epic AC5 requires tests for multi-level aggregation, category mapping, and edit/delete propagation (PRD
§7.6). Roll-up correctness is the heart of the milestone.

## Task
Add integration tests for the roll-up engine across the three levels and three sources.

## Acceptance criteria
- [x] Integration tests (M01.3 harness) seed stays, plan items, and cost entries across categories/days
  and assert correct **per-category, per-day, per-trip** totals.
- [x] Tests cover **category mapping** for each source type.
- [x] Tests cover **edit/delete propagation** for each source (totals change correctly).
- [x] A test covers trip-vs-day budget interaction (per-day lines plus a trip-level line).

## Constraints
- Reuse the M01.3 harness; hermetic per-test state.
- Read costs across modules only via the Trip interface (consistent with S3).

## Definition of done
Multi-level aggregation, mapping, propagation, and trip-vs-day interaction are covered by green
integration tests.

## Dependencies
S1–S4, M01.3 S7 (harness). Satisfies epic AC5.
