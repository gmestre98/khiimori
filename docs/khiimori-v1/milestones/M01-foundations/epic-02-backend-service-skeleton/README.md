# Epic M01.2 — Backend Service Skeleton & Health Endpoints

> **Status:** ✅ Done — all 8 stories implemented and all 5 acceptance criteria verified.
>
> Milestone: [01 — Foundations](../README.md) · PRD refs: §6, §7.1.

## Description

Make the Go service actually run: a single HTTP server that wires the internal modules together,
a shared `platform` layer (config, logging, HTTP middleware, error handling), and liveness/readiness
endpoints so deployment and monitoring have something to check.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] `/cmd/api` boots one HTTP server that mounts each module's (empty) routes through their interfaces (PRD §7.1).
- [x] `platform` provides config loading, structured logging, common HTTP middleware, and error handling reused by all modules.
- [x] `GET /healthz` returns 200 liveness with no external dependencies.
- [x] `GET /readyz` reports readiness (and will gate on DB connectivity once Epic M01.3 lands).
- [x] Unit tests cover middleware and the health handlers (PRD §7.6).

## Implementation Details / Architecture

- The `platform` layer is the only place cross-cutting concerns live, keeping modules thin (PRD §7.1).
- `readyz` is structured so Epic M01.3 can plug the DB check in without changing the contract.
- Logging is structured JSON from the start to feed Cloud Logging (Epic M01.7).

## Dependencies

- **Upstream:** M01.1 (repo + Go module skeleton).
- **Downstream:** M01.3 (adds DB check to `readyz`), M01.4/M01.5 (deploy this service), M01.7 (consumes logs).

## Costs Impact

None directly — runs on Cloud Run's scale-to-zero free tier once deployed (cost handled in M01.4/M01.8).

## Designs

N/A (health-check only).

## User stories

The epic is split into **8 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-platform-config.md) | Platform config loader | ~2.5h | AC2 | — (M01.1) |
| [S2](S2-structured-logging.md) | Structured JSON logging | ~2.5h | AC2 | S1 |
| [S3](S3-http-server-bootstrap.md) | HTTP server bootstrap & graceful shutdown | ~3h | AC1 | S1, S2 |
| [S4](S4-module-route-mounting.md) | Module route-mounting interface | ~3h | AC1 | S3 |
| [S5](S5-http-middleware.md) | Common HTTP middleware (id, log, recovery) | ~3.5h | AC2, AC5 | S2, S3 |
| [S6](S6-error-handling.md) | Shared error handling & JSON errors | ~3h | AC2 | S2 |
| [S7](S7-healthz-liveness.md) | `GET /healthz` liveness endpoint | ~2h | AC3, AC5 | S3, S4 |
| [S8](S8-readyz-readiness.md) | `GET /readyz` readiness (pluggable checks) | ~3h | AC4, AC5 | S3, S4 |

**Total:** ~22.5h (≈ 2.5–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Config ──┬─ S2 Logging ─┬─ S5 Middleware (needs S3)
            │              └─ S6 Error handling
            └──────────────── S3 Server bootstrap (needs S1+S2)
                                 └─ S4 Module route mounting
                                       ├─ S7 /healthz
                                       └─ S8 /readyz
```

S2 and (after it) S6 can run alongside the server work; S7 and S8 can run in parallel once S4 lands.
AC5's required tests live in S5 (middleware) and S7/S8 (health handlers).

## Verification (2026-06-12)

All 8 stories were audited against the code; `go build ./...`, `go vet ./...`, and `go test ./...`
are green. Where each story landed:

| Story | Implementation | Tests |
|-------|----------------|-------|
| S1 config | `internal/platform/config` — typed `Config` (port, env, log level, `DatabaseURL` placeholder), `Load()` with defaults `PORT=8080`/`ENV=dev`/`LOG_LEVEL=error`, loaded once in `cmd/api` | defaults, overrides, invalid `PORT`/`ENV`/`LOG_LEVEL` |
| S2 logging | `internal/platform/log` — `log/slog` JSON logger from `Config`, `WithContext`/`FromContext` for request-scoped loggers, no global default | JSON shape, level filtering, structured fields, context round-trip & fallback |
| S3 bootstrap | `cmd/api/main.go` — single `http.Server` with read/write/idle timeouts, graceful drain on SIGINT/SIGTERM (15s bound), non-zero exit + logged error on failed bind | covered via build/vet (per story DoD) |
| S4 mounting | `internal/platform/httpx.RouteRegistrar`; all six modules (`auth`, `trip`, `budget`, `journal`, `sharing`, `geo`) expose `New()` satisfying it; `cmd/api.newRouter` is the single composition root | compile-time interface checks per module; `internal/boundaries` guards imports |
| S5 middleware | `internal/platform/httpx/middleware.go` — `RequestIDMiddleware` (honours inbound `X-Request-Id`), `Logging` (error-level line for 5xx only; success path exists at info), `Recovery` (clean JSON 500 via S6) | id generation/echo, inbound id honoured, 5xx logs / 200 silent, panic → 500 without leaking the panic value |
| S6 errors | `internal/platform/httpx/error.go` — typed `APIError` (status/code/message), `WriteError` renders `{"error":{code,message,request_id}}`; unmapped errors → generic 500 | typed error mapped, unknown → generic 500, request id included/omitted |
| S7 `/healthz` | `internal/platform/health/healthz.go` — constant 200 `{"status":"ok"}`, zero I/O, mounted on the root router inside the middleware chain | 200 + body via `httptest` |
| S8 `/readyz` | `internal/platform/health/readyz.go` — named `ReadinessCheck` registry, per-check JSON status, 503 naming failures, 2s probe timeout; `TODO(M01.3)` seam in `cmd/api` for the DB check | no checks → 200, passing → 200, failing → 503, hung check bounded |

