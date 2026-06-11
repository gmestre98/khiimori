# S2 — Structured JSON logging

## Context
Logs must be **structured JSON from the start** so they feed Cloud Logging cleanly once the service
deploys (Epic M01.7). This story adds the shared logger to the `platform` layer; every module and the
middleware (S5) will log through it rather than `fmt`/`log`.

Assumes the config loader from **S1** exists (the logger reads its level from `Config`).

## Task
Add `internal/platform/log` providing a structured JSON logger constructed from `Config`.

## Acceptance criteria
- [ ] A constructor builds a logger that emits **JSON** lines with at least `level`, `time`, and `msg`.
- [ ] Log level is driven by `Config.LogLevel` from S1 (e.g. `debug`/`info`/`warn`/`error`).
- [ ] The logger supports structured key/value fields (e.g. `With`/attributes), not just format strings.
- [ ] A way to attach a logger to / retrieve it from a `context.Context` so request-scoped fields
  (request id, etc. — added in S5) flow through.
- [ ] Unit tests assert output is valid JSON and respects the configured level.

## Constraints
- Prefer the standard library `log/slog` with a JSON handler over a third-party logging framework (PRD §7.0).
- No global default logger that hides the dependency — pass it explicitly (a single composition-root
  instance is fine).

## Definition of done
`go test ./internal/platform/log/...` is green; emitted lines parse as JSON and honour the level.

## Dependencies
S1 (config supplies the log level).
