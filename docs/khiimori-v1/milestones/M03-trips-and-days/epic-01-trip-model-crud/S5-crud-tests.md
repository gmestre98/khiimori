# S5 — Trip CRUD & owner-membership tests

## Context
Epic AC5 requires unit + integration tests covering create/edit/archive/delete and owner-membership
creation (PRD §7.6). Trips are the backbone every later milestone depends on, so the CRUD contract is
covered against a real schema.

## Task
Add integration tests for trip CRUD and owner-membership behaviour against a migrated schema.

## Acceptance criteria
- [x] Integration tests run the migrations (S1, S2) against the M01.3 ephemeral/test DB.
- [x] Tests cover: create (with Owner membership written), edit (with validation), archive (hidden,
  retained), and delete (cascade, no orphans).
- [x] A test asserts the owner-membership row exists with role Owner after create.
- [x] A test asserts delete cascades days/memberships transactionally (counts go to zero).

## Constraints
- Reuse the M01.3 integration harness; hermetic per-test schema state.
- Drive through the service/endpoints so the transactional guarantees are exercised.

## Definition of done
CRUD + owner-membership + cascade behaviours are covered by green integration tests.

## Dependencies
S1–S4, M01.3 S7 (harness). Satisfies epic AC5.
