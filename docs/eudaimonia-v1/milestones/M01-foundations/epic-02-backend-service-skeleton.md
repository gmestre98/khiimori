# Epic M01.2 — Backend Service Skeleton & Health Endpoints

> Milestone: [01 — Foundations](README.md) · PRD refs: §6, §7.1.

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
