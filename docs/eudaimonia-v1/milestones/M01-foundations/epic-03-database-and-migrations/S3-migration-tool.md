# S3 — Select & wire a migration tool

## Context
Schema changes must be versioned and repeatable from day one (PRD §7.7). This story chooses a Go-friendly
migration tool and wires it into the repo so migrations can be authored and applied consistently in local
dev and CI (M01.5). It does **not** define the per-module schemas yet — that's S4 — it just establishes the
mechanism and conventions.

Assumes the DB connection details from **S1** are available.

## Task
Pick a migration tool, add it to the project, and establish the migration directory layout + naming convention.

## Acceptance criteria
- [ ] A migration tool is added (e.g. `golang-migrate`, `goose`, or `atlas`) with a short rationale recorded.
- [ ] A migrations directory and an explicit **up/down** (or versioned) naming convention are documented.
- [ ] The tool reads the connection string from config/env (never hardcoded) and works against the **direct**
  Neon connection (migrations bypass the pooler).
- [ ] A trivial throwaway migration applies and rolls back cleanly against the dev database to prove the wiring.
- [ ] Tool version is pinned for reproducibility.

## Constraints
- One tool, minimal config (PRD §7.0). Prefer plain SQL migrations over a heavy ORM/DSL.
- Adding a migration tool is a new third-party dependency — **confirm the specific choice with the author
  and record it here before adding it** (project rule: stdlib-first, ask before adding deps).
- Keep migrations runnable both locally and from CI (the actual CI step is M01.5).

## Definition of done
A reviewer can run the documented migrate command and see the throwaway migration apply + roll back on the dev DB.

## Dependencies
S1 (DB reachable). Precedes S4 (schemas) and S5 (runner command).
