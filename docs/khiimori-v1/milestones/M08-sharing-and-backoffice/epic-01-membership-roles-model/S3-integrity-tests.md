# S3 — Referential integrity & lifecycle tests

## Context
Memberships use **foreign keys and transactional updates** so access changes can't leave orphaned or
over-shared data — the PRD's stated reason for a relational DB in safety-critical access control (PRD
§7.7). Epic AC requires tests for add/change/revoke and integrity.

## Task
Add integration tests for membership lifecycle and referential integrity.

## Acceptance criteria
- [ ] Integration tests (M01.3 harness) cover **add**, **change role**, and **revoke**.
- [ ] A test asserts referential integrity: deleting a trip/user does not leave orphaned memberships
  (FK/cascade behaviour as designed).
- [ ] A test asserts transactional behaviour (a failed multi-step change rolls back).
- [ ] Tests confirm the Owner row from Milestone 03 integrates with the lifecycle.

## Constraints
- Reuse the M01.3 integration harness; hermetic state.
- Treat access-control data as safety-critical (thorough coverage, PRD §7.7).

## Definition of done
Membership lifecycle and referential integrity are covered by green integration tests.

## Dependencies
S1, S2, M01.3 S7 (harness). Satisfies epic AC4.
