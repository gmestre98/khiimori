# S4 — Integration-test stage against an ephemeral DB

## Context
The PRD requires integration tests against a real database in the pipeline (PRD §7.6). M01.3 S7 already wrote
the migration integration test that targets an **ephemeral Neon branch**; this story runs it (and future
integration tests) as a dedicated CI stage with the DB credentials supplied securely.

Assumes the base workflow (**S1**) and the integration test from M01.3 S7 exist.

## Task
Add a CI stage that provisions an ephemeral DB and runs the integration test suite against it.

## Acceptance criteria
- [ ] A CI stage runs the integration-tagged tests (M01.3 S7) against an **ephemeral Neon branch** (or test DB).
- [ ] DB connection details are injected from **GitHub secrets**, never printed to logs (PRD §8.5).
- [ ] The stage runs after build and **gates the change** on integration failures.
- [ ] The ephemeral branch/DB is **torn down** (or relies on Neon expiry) so branches don't accumulate (PRD §8.1).
- [ ] Runs only where appropriate (e.g. PRs + `main`) to conserve CI minutes (PRD §8.4 #4).

## Constraints
- Never run integration tests against the prod DB — ephemeral branches only.
- No secrets in logs; mask DB URLs.

## Definition of done
CI spins up an ephemeral DB, runs migrations + integration tests green, and cleans up; a failure gates the PR.

## Dependencies
S1 (workflow), M01.3 S7 (integration test). Pairs with S7 (deploy runs migrations too).
