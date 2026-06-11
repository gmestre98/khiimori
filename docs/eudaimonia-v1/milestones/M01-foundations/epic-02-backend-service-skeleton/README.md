# Epic M01.2 — Backend Service Skeleton & Health Endpoints

> Milestone: [01 — Foundations](../README.md) · PRD refs: §6, §7.1.

## Description

Make the Go service actually run: a single HTTP server that wires the internal modules together,
a shared `platform` layer (config, logging, HTTP middleware, error handling), and liveness/readiness
endpoints so deployment and monitoring have something to check.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] `/cmd/api` boots one HTTP server that mounts each module's (empty) routes through their interfaces (PRD §7.1).
- [ ] `platform` provides config loading, structured logging, common HTTP middleware, and error handling reused by all modules.
- [ ] `GET /healthz` returns 200 liveness with no external dependencies.
- [ ] `GET /readyz` reports readiness (and will gate on DB connectivity once Epic M01.3 lands).
- [ ] Unit tests cover middleware and the health handlers (PRD §7.6).

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

