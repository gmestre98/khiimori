# S3 — HTTP server bootstrap & graceful shutdown

## Context
`/cmd/api` should boot **one** HTTP server that everything else hangs off of (PRD §7.1). This story
turns the stub `main()` from M01.1 into a real server with a clean lifecycle — it builds `Config` (S1),
the logger (S2), starts listening, and shuts down gracefully on SIGINT/SIGTERM (important for Cloud Run).
Routes are still empty here; mounting modules is **S4**.

Assumes config (**S1**) and logging (**S2**) exist.

## Task
Wire `/cmd/api/main.go` to construct config + logger and run an HTTP server with graceful shutdown.

## Acceptance criteria
- [ ] `main()` loads `Config`, builds the logger, and starts a single `http.Server` on the configured port.
- [ ] Server uses sensible read/write/idle timeouts (no unbounded defaults).
- [ ] On SIGINT/SIGTERM the server stops accepting connections and drains in-flight requests within a
  bounded timeout, then exits 0; a failed bind/start exits non-zero with a logged error.
- [ ] Startup and shutdown are logged via the S2 structured logger.
- [ ] `go build ./...` and `go vet ./...` succeed.

## Constraints
- **Standard library `net/http` only** — no web framework or other third-party dependency; ask first and
  record it here if you think one is needed (PRD §7.0).
- Let `main` build the router and hand it to the server so S4 can mount the modules; don't hardcode routes here.
- No domain behaviour and no health endpoints yet (those are S7/S8).

## Definition of done
`go run ./cmd/api` starts, logs a structured "starting"/"listening" line, and shuts down cleanly on Ctrl-C.

## Dependencies
S1 (config), S2 (logging).
