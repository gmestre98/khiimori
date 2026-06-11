# S5 — Migration runner command

## Context
Migrations need a single, documented way to run — locally, in the deploy step (M01.5), and during
integration tests (S7). This story wraps the tool from S3 in a thin runner so "apply migrations" is one
command everywhere, reading the target DB from config.

Assumes the migration tool (**S3**) and schemas (**S4**) exist.

## Task
Provide a documented command/target that applies (and can roll back) migrations against a configured database.

## Acceptance criteria
- [ ] One command applies all pending migrations (e.g. `make migrate-up` / `scripts/migrate.ts` / a Go
  subcommand) using the **direct** connection from config.
- [ ] A matching command rolls back (or to a version) for local iteration.
- [ ] The command exits non-zero with a clear message on failure (so CI can gate on it).
- [ ] It targets whatever DB the config/env points at (dev, ephemeral test branch, prod) with no code change.
- [ ] Usage is documented (one short section).

## Constraints
- Reuse the existing language/tooling (Go or the TS scripts dir, per the one-language-for-scripting rule) —
  no new runtime (PRD §7.0, §7.3).
- No secrets in command output/logs.

## Definition of done
A reviewer runs the documented up/down commands against the dev DB and sees migrations apply and revert.

## Dependencies
S3 (tool), S4 (schemas). Consumed by S7 (integration test) and M01.5 (CI deploy).
