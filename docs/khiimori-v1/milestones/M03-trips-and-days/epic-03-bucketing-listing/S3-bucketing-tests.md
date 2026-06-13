# S3 — Bucketing edge-case tests

## Context
Epic AC4 requires tests covering bucketing edge cases with a fixed "today" reference: a trip spanning
today, a single-day trip, and the past/future boundaries (PRD §5.1, §7.6).

## Task
Add unit + integration tests for bucketing and the listing endpoint.

## Acceptance criteria
- [ ] Unit tests for S1 cover: trip **spanning today** (Current), **single-day** trip on today (Current),
  trip ending **yesterday** (Past), trip starting **tomorrow** (Upcoming), and exact start/end == today
  boundaries.
- [ ] An integration test for S2 asserts archived trips are excluded and the current trip is flagged.
- [ ] An integration test asserts the listing is **scoped** (a user does not see another user's trips).
- [ ] Tests use a **fixed `today`** for determinism.

## Constraints
- Inject `today` rather than using the wall clock so tests are deterministic.
- Reuse the M01.3 integration harness for the endpoint tests.

## Definition of done
Bucketing boundaries, archived exclusion, current-trip flagging, and scoping are covered by green tests.

## Dependencies
S1, S2. Satisfies epic AC4.
