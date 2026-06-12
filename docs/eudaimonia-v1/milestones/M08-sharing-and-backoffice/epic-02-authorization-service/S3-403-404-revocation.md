# S3 — 403/404 enforcement & immediate revocation

## Context
Unauthorized access yields **`403`/`404`** (not data), no endpoint relies on client-side checks, and
**revocation takes effect immediately** — a revoked member loses access on the next request (PRD §5.9, §6).

## Task
Ensure consistent 403/404 behaviour and immediate effect of revocation.

## Acceptance criteria
- [ ] Unauthorized trip-scoped requests return **`403`/`404`** (not data), per the documented rule (avoid
  leaking existence where appropriate).
- [ ] After a membership is **revoked** (Epic 01 / Epic 03), the next request from that user is denied —
  no stale-cache window that grants access.
- [ ] A **role downgrade** (e.g. Editor → Viewer) takes effect on the next request (writes denied).
- [ ] A unit/integration test covers revoke-then-denied and downgrade-then-readonly.

## Constraints
- The `Authorizer` reads current membership state per request (no long-lived authz cache that defeats
  immediate revocation) — or invalidates such a cache on change.
- Reuse the 403/404 convention established in Milestone 03 Epic 04.

## Definition of done
Unauthorized access returns 403/404 and revocation/downgrade take effect immediately; tests green.

## Dependencies
S1, S2, Epic 01 (revoke), Epic 03 (revoke via UI). Tested broadly in S5.
