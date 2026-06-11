# S7 — `GET /healthz` liveness endpoint

## Context
Deployment and monitoring need a cheap, dependency-free liveness probe (PRD §7.1; epic AC3). `/healthz`
answers "is the process up?" — it must **not** touch the database or any external service, so Cloud Run /
uptime checks never restart a healthy pod because a downstream is slow. Readiness (which *does* check
dependencies) is the separate `/readyz` endpoint in S8. This is one of the handlers the epic explicitly
requires tests for (PRD §7.6, epic AC5).

Assumes the server + module mounting (**S3**, **S4**) exist.

## Task
Add a `GET /healthz` handler that returns 200 with no external dependencies, mounted on the root router.

## Acceptance criteria
- [ ] `GET /healthz` returns `200 OK` with a small JSON body (e.g. `{ "status": "ok" }`).
- [ ] The handler performs **no** I/O to the database or any external dependency.
- [ ] Mounted via the shared router so it inherits the S5 middleware chain.
- [ ] **Unit tests** assert the 200 status and body using `httptest`.

## Constraints
- Keep it trivial and constant-time — liveness must never depend on app health beyond "the process serves HTTP".
- Don't fold readiness logic in here; that's S8.

## Definition of done
`go test ./...` is green and a request to `/healthz` on the running server returns 200.

## Dependencies
S3 (server), S4 (route mounting). Optionally reuses S6's JSON writer.
