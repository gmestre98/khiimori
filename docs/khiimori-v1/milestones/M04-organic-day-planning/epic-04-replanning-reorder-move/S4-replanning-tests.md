# S4 — Re-planning tests (reorder / move / status)

## Context
Epic AC4 requires tests for reorder, move-between-days, and status transitions, designed for offline
replay (PRD §7.6, §6). Re-planning is the spontaneity core, so it gets explicit coverage.

## Task
Add unit + integration tests for reorder, move, and status, including replay safety.

## Acceptance criteria
- [ ] Tests cover **reorder** within a day (sequence updates; convergence-friendly).
- [ ] Tests cover **move between days** (day_id change, order placement, same row).
- [ ] Tests cover **status transitions** (each value; invalid rejected).
- [ ] A test replays the same reorder/move/status mutation twice and asserts **no duplication/corruption**
  (idempotency for Epic 06).
- [ ] Integration tests run against the migrated schema (M01.3 harness).

## Constraints
- Reuse the M01.3 harness; hermetic per-test state.
- Assert convergence for concurrent-ish reorders so offline replay (Epic 06) is safe.

## Definition of done
Reorder/move/status behaviours and replay-idempotency are covered by green tests.

## Dependencies
S1–S3, M01.3 S7 (harness). Satisfies epic AC4; underpins Epic 06.
