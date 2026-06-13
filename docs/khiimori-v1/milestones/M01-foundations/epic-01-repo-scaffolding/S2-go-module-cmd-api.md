# S2 — Go module + `/cmd/api` entrypoint that compiles

> **Status:** ✅ Done.

## Context
Khiimori's backend is a **Go modular monolith** (a single Go service with clean internal modules,
peelable into services later). This story stands up the Go module and a minimal API entrypoint —
the real, compiling binary everything else builds on. No behaviour yet.

Assumes the monorepo layout from **S1** exists (`/backend` directory present).

## Task
Initialise the Go module under `/backend` and add a minimal `/cmd/api` entrypoint that compiles.

## Acceptance criteria
- [x] `go.mod` initialised under `/backend` with an agreed module path
  (e.g. `github.com/gmestre98/khiimori/backend`) and a pinned recent Go version.
- [x] `backend/cmd/api/main.go` exists with a `main()` that starts and exits cleanly (a stub is fine
  — e.g. log "starting" and return).
- [x] From `/backend`: `go build ./...`, `go vet ./...`, and `go test ./...` all succeed.
- [x] No domain behaviour and no HTTP server yet — intentionally empty entrypoint.

## Constraints
- One language per layer: Go only in `/backend`. No frameworks pulled in yet.
- Don't create the internal domain packages here — that's S3.

## Definition of done
`cd backend && go build ./... && go vet ./... && go test ./...` is green on a clean checkout.

## Dependencies
S1 (monorepo skeleton). Can run in parallel with S5 (web app).
