# S5 — Provisioning integration tests

## Context
Epic AC5 requires unit + integration tests covering first-time provisioning, returning-user resolution,
and the email-change-no-duplicate case (PRD §7.6). S2–S3 add unit coverage; this story adds
integration coverage against a real database schema using M01.3's ephemeral test DB.

## Task
Add integration tests for provisioning that run against a migrated `auth` schema.

## Acceptance criteria
- [ ] An integration test runs the migrations (S1) against the ephemeral/test DB (M01.3 S7 harness) and
  exercises provisioning end-to-end.
- [ ] First sign-in **creates** a user with EUR/`is_admin=false`/empty profile.
- [ ] A returning sign-in **resolves to the same row**; a changed email **updates, not duplicates**
  (verified by row count + fields).
- [ ] The unique-`google_sub` constraint is exercised (a concurrent/duplicate insert does not create two
  rows).

## Constraints
- Reuse the M01.3 integration-test harness (ephemeral Neon branch / test DB); do not stand up a new test
  infra.
- Keep tests hermetic — each test migrates/cleans its own schema state.

## Definition of done
Integration tests prove create, resolve, and email-change behaviour against a real migrated schema and
are green in CI.

## Dependencies
S1–S4, M01.3 S7 (integration-test harness). Satisfies epic AC5.
