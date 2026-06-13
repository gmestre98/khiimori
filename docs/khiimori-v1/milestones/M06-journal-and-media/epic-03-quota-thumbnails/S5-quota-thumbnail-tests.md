# S5 — Cap, usage & thumbnail tests

## Context
Epic AC5 requires unit + integration tests for cap enforcement, usage accounting, and thumbnail generation
(PRD §7.6). This is the storage-cost guardrail, so it gets thorough coverage.

## Task
Add integration tests for the quota and thumbnail pipeline.

## Acceptance criteria
- [ ] Integration tests (M01.3 harness, faked/local `MediaStore`) cover **cap enforcement** (under / at /
  over → rejected).
- [ ] Tests cover **usage accounting** on add and delete (no drift).
- [ ] Tests cover **thumbnail generation** (a variant is produced and associated).
- [ ] A test confirms an over-cap upload stores **nothing** (no object, no row, no usage change).

## Constraints
- Fake the storage backend and image step where needed; keep tests hermetic and CI-friendly.
- Assert the **server-side** guarantee (the cap can't be bypassed).

## Definition of done
Cap enforcement, usage accounting, and thumbnailing are covered by green integration tests.

## Dependencies
S1–S4, M01.3 S7 (harness). Satisfies epic AC5.
