# S6 — Shared error handling & JSON error responses

## Context
Every module returns errors the same way, so the API speaks one consistent error shape and modules stay
thin (PRD §7.1). This story adds the `platform` error helpers: a typed API error and a single writer that
turns errors into a structured JSON response with the right status code. The recovery middleware (S5) and
all future handlers use it.

Assumes the logger (**S2**) exists; pairs with the middleware story (**S5**).

## Task
Add shared error types and a JSON error-response writer to the `platform` layer.

## Acceptance criteria
- [ ] A typed API error carries an HTTP status, a stable machine-readable `code`, and a safe message.
- [ ] A single `WriteError`-style helper renders any error as JSON (e.g. `{ "error": { "code", "message" } }`)
  with the correct status; unknown/unmapped errors become a generic `500` without leaking internals.
- [ ] Consistent `Content-Type: application/json` and inclusion of the request id (from S5) when present.
- [ ] Helpers are reusable by every module — they live in `platform`, not in a single module.
- [ ] Unit tests cover: a typed error → mapped status/body, and an unknown error → generic 500.

## Constraints
- Standard library `encoding/json` only (PRD §7.0).
- Never expose internal error strings/stack traces to clients; log details server-side instead.

## Definition of done
`go test ./internal/platform/...` is green; mapped and unmapped error paths both verified.

## Dependencies
S2 (logging). Consumed by S5 (recovery body) and S7/S8 (health handlers may reuse the writer).
