# S4 — Shared-mechanism contract & tests

## Context
The queue/replay must be **one shared mechanism, co-designed with Milestone 06** (PRD §7.0), and epic AC
requires tests for queue → replay, idempotent replay, and a basic conflict case (PRD §7.6).

## Task
Document the shared queue/replay contract for Milestone 06 to reuse, and add the test suite.

## Acceptance criteria
- [x] A documented **contract** describes the queue record format and the replay/conflict behaviour so
  Milestone 06 reuses it verbatim (not a second implementation).
- [x] Tests cover **queue → replay** (offline mutate, reconnect, server reflects).
- [x] Tests cover **idempotent replay** (replaying twice produces no duplicates).
- [x] A test covers a **basic conflict** case with the deterministic outcome (S3).

## Constraints
- The contract is binding for Milestone 06's Journal offline (one mechanism, PRD §7.0).
- Keep tests runnable in CI without a live network (simulate offline/online).

## Definition of done
The shared offline contract is documented and the queue/replay/conflict behaviours are covered by green
tests.

## Dependencies
S1–S3. Consumed by Milestone 06 Epic 04 and Milestone 09 Epic 04; verified end-to-end in Milestone 10.
