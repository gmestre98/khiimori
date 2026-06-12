# S1 — Platform config loader

> **Status:** ✅ Done.

## Context
Eudaimonia's backend is a **Go modular monolith**. The `platform` layer is the single home for
cross-cutting concerns so the domain modules stay thin (PRD §7.1). This story adds the first piece:
a small, typed configuration loader the rest of the service reads from — HTTP port, environment name,
log level, and a placeholder for the (later) database URL.

Assumes the Go module + `internal/platform` package skeleton from **M01.1** exist.

## Task
Add `internal/platform/config` that loads typed configuration from the environment with sane defaults.

## Acceptance criteria
- [x] A `Config` struct exposes at least: HTTP port, environment (`dev`/`prod`), and log level.
- [x] A `Load()` function reads from environment variables with documented defaults
  (e.g. `PORT=8080`, `ENV=dev`, `LOG_LEVEL=error`) and returns a clear error on invalid values.
  Default log level is `error` — project-wide we emit only error logs for now (see S2).
- [x] `Config` is loaded once at startup in `main` and read from there — no global mutable state.
  (No dependency-injection framework or wiring — plain Go, load once and pass the value where needed.)
- [x] Unit tests cover defaults, overrides, and at least one invalid-value path.

## Constraints
- **Standard library only.** No config framework or any third-party dependency. If you think one is
  genuinely needed, **ask first** and record the decision here before adding it (PRD §7.0).
- Don't read config in `init()` or package globals — keep it explicit.
- Leave a typed field for the database URL but do **not** require it yet (M01.3 wires DB in).

## Definition of done
`go test ./internal/platform/config/...` is green; defaults and overrides both verified.

## Dependencies
M01.1 (Go module + platform package skeleton). No intra-epic dependency — can start first.
