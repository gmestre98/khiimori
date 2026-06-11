# S5 — Common HTTP middleware (request id, access log, recovery)

## Context
Cross-cutting HTTP concerns belong in the `platform` layer so every module gets them for free and stays
thin (PRD §7.1). This story adds the shared middleware chain: a per-request id, a structured access log,
and panic recovery so one bad handler can't take the server down. This is one of the two areas the epic
explicitly requires unit tests for (PRD §7.6, epic AC5).

Assumes the logger (**S2**) and the server bootstrap (**S3**) exist.

## Task
Add `internal/platform/http` (or similar) middleware and apply the chain to the root router.

## Acceptance criteria
- [ ] **Request id** middleware: generates an id per request (honouring an inbound `X-Request-Id` if present),
  puts it on the request `context.Context`, and sets it on the response header.
- [ ] **Access log** middleware: logs method, path, status, and duration as one structured JSON line via the
  S2 logger, including the request id.
- [ ] **Recovery** middleware: recovers panics, logs them with stack/context, and returns a clean `500`
  (using the S6 error response once available, or a minimal JSON 500 if S6 lands later).
- [ ] Middleware is composed in a clear order and applied once at the root so all modules inherit it.
- [ ] **Unit tests** cover each middleware: id propagation, a logged request, and a recovered panic → 500.

## Constraints
- Standard library `net/http` handlers only — no framework middleware stack (PRD §7.0).
- Read/write request-scoped values through `context.Context`, not globals.

## Definition of done
`go test ./internal/platform/...` is green; the three middleware behaviours are each asserted by a test.

## Dependencies
S2 (logging), S3 (server). Coordinates with S6 (error responses) for the recovery body.
