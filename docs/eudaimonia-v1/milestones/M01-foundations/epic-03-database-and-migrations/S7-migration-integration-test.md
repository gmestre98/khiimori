# S7 — Integration test: migrations on an ephemeral DB

## Context
The PRD requires integration tests for service-to-database behaviour (PRD §7.6). This story adds the first
one: spin up an **ephemeral Neon branch** (or equivalent throwaway test database), run all migrations against
it, and assert the expected schema-per-module result. This is the test M01.5's integration stage will run in CI.

Assumes the migration runner (**S5**) and schema migrations (**S4**) exist.

## Task
Add an integration test that provisions an ephemeral database, runs migrations, and verifies the schemas exist.

## Acceptance criteria
- [ ] The test creates/targets an **ephemeral Neon branch** (preferred) or a disposable test database from config.
- [ ] It runs the full migration set via the S5 runner and asserts the six module schemas exist (and roll back cleanly).
- [ ] The test is **hermetic and CI-runnable**: connection details come from env/secrets, and it tears the
  branch/DB down (or relies on Neon branch expiry) afterwards.
- [ ] It is gated behind an integration build tag/flag so unit runs stay fast and DB-free.
- [ ] Documented how to run it locally (env vars needed).

## Constraints
- Never run integration migrations against the real prod DB — only ephemeral branches/test DBs.
- Keep it within Neon free-tier branch limits (PRD §8.1); clean up to avoid branch sprawl.

## Definition of done
`go test -tags=integration ./...` (or the documented command) provisions a branch, migrates, asserts the
six schemas, and cleans up — green locally.

## Dependencies
S4 (schemas), S5 (runner). Consumed by M01.5 (CI integration stage). Satisfies epic AC5.
