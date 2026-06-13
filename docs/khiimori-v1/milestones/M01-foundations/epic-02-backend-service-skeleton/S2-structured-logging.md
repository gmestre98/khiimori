# S2 — Structured JSON logging

> **Status:** ✅ Done.

## Context
Logs must be **structured JSON from the start** so they feed Cloud Logging cleanly once the service
deploys (Epic M01.7). This story adds the shared logger to the `platform` layer; every module and the
middleware (S5) will log through it rather than `fmt`/`log`.

**Logging policy (project-wide, v1):** the logger must be able to log at all levels, but for now we
**only emit error-level logs** across the whole project — keep the default level at `error` (from S1) and
add log calls only on errors. Other levels exist for when we deliberately turn them on later.

Assumes the config loader from **S1** exists (the logger reads its level from `Config`).

## Task
Add `internal/platform/log` providing a structured JSON logger constructed from `Config`.

## Acceptance criteria
- [x] A constructor builds a logger that emits **JSON** lines with at least `level`, `time`, and `msg`.
- [x] Log level is driven by `Config.LogLevel` from S1; **all levels are supported** but the default is
  `error` and v1 emits **error-level logs only** project-wide.
- [x] The logger supports structured key/value fields (e.g. `With`/attributes), not just format strings.
- [x] A way to attach a logger to / retrieve it from a `context.Context` so request-scoped fields
  (request id, etc. — added in S5) flow through.
- [x] Unit tests assert output is valid JSON and respects the configured level.

## Constraints
- **Standard library only** — use `log/slog` with a JSON handler. No third-party logging library; if you
  think one is needed, **ask first** and record it here before adding it (PRD §7.0).
- No global default logger — construct one logger at startup and pass it where it's needed (plain Go, not a
  DI framework).

## Definition of done
`go test ./internal/platform/log/...` is green; emitted lines parse as JSON, honour the level, and only
error-level logs are emitted by default.

## Dependencies
S1 (config supplies the log level).
