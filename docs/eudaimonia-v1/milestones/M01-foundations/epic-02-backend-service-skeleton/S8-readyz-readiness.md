# S8 — `GET /readyz` readiness endpoint (pluggable checks)

> **Status:** ✅ Done.

## Context
Readiness answers "can this instance serve traffic *right now*?" — unlike liveness (S7), it **may** depend
on downstreams (epic AC4). Today there are no downstreams, so `/readyz` returns ready; but it must be built
so Epic **M01.3** can plug a DB connectivity check in **without changing the contract** (PRD §7.1). The fix
is a small check-registry the handler aggregates over. This is one of the handlers the epic requires tests
for (PRD §7.6, epic AC5).

Assumes the server + module mounting (**S3**, **S4**) exist.

## Task
Add a `GET /readyz` handler backed by a registry of named readiness checks, mounted on the root router.

## Acceptance criteria
- [x] A `ReadinessCheck` abstraction (a named func returning an error) and a way to register checks at startup.
- [x] `GET /readyz` runs all registered checks: `200` with a per-check JSON status when all pass; `503` with
  the failing checks named when any fails.
- [x] With **no** checks registered (today's state) it returns `200 ready`.
- [x] Checks run with a bounded timeout so a hung dependency can't hang the probe.
- [x] The contract is stable so M01.3 can register a DB check with no handler/route changes — leave a
  documented seam/TODO marking where the DB check will attach.
- [x] **Unit tests** cover: no checks → 200, a passing check → 200, and a failing check → 503.

## Constraints
- Standard library only (PRD §7.0).
- Keep `/readyz` distinct from `/healthz` — do not make liveness depend on readiness checks.

## Definition of done
`go test ./...` is green; `/readyz` returns 200 today and a failing registered check yields 503 in tests.

## Dependencies
S3 (server), S4 (route mounting). Downstream: M01.3 registers the DB check here.
