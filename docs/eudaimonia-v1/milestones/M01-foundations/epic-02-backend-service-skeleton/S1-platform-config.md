# S1 — Platform config loader

## Context
Eudaimonia's backend is a **Go modular monolith**. The `platform` layer is the single home for
cross-cutting concerns so the domain modules stay thin (PRD §7.1). This story adds the first piece:
a small, typed configuration loader the rest of the service reads from — HTTP port, environment name,
log level, and a placeholder for the (later) database URL.

Assumes the Go module + `internal/platform` package skeleton from **M01.1** exist.

## Task
Add `internal/platform/config` that loads typed configuration from the environment with sane defaults.

## Acceptance criteria
- [ ] A `Config` struct exposes at least: HTTP port, environment (`dev`/`prod`), and log level.
- [ ] A `Load()` function reads from environment variables with documented defaults
  (e.g. `PORT=8080`, `ENV=dev`, `LOG_LEVEL=info`) and returns a clear error on invalid values.
- [ ] No global mutable state — `Config` is constructed once and passed in (dependency injection).
- [ ] Unit tests cover defaults, overrides, and at least one invalid-value path.

## Constraints
- Standard library only where reasonable; no heavyweight config framework (PRD §7.0).
- Don't read config in `init()` or package globals — keep it explicit.
- Leave a typed field for the database URL but do **not** require it yet (M01.3 wires DB in).

## Definition of done
`go test ./internal/platform/config/...` is green; defaults and overrides both verified.

## Dependencies
M01.1 (Go module + platform package skeleton). No intra-epic dependency — can start first.
