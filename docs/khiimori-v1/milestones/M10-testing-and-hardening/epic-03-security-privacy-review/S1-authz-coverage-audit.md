# S1 — Authorization coverage audit (every endpoint)

## Context
**Authorization** must be verified on **every** trip-scoped endpoint — no endpoint trusts the client (PRD
§5.9, §6). This audit cross-checks the endpoint inventory against the `Authorizer` (Milestone 08 S4).

## Task
Audit every trip-scoped endpoint for server-side authorization and record the results.

> **Status:** ✅ Done — audit recorded in [S1 REPORT](S1-authz-coverage-audit-REPORT.md).
> No enforcement gaps; one informational finding (F1: 403/404 convention) tracked in S3.

## Acceptance criteria
- [x] An **endpoint inventory** of all trip-scoped routes (Trip, Budget, Journal, Geo, Sharing) is
  produced.
- [x] Each is confirmed to call the `Authorizer` **before** reading/writing; unauthorized → `403`/`404`,
  not data.
- [x] Any endpoint **missing** enforcement is flagged as a finding (input to S3 remediation).
- [x] The audit notes the `403` vs `404` convention is applied consistently.

## Constraints
- Cross-reference Milestone 08 Epic 02 S4 (cross-module wiring) — this audit confirms no bypass.
- Treat any unauthenticated/unauthorized data exposure as release-blocking.

## Definition of done
Every trip-scoped endpoint is audited for server-side authorization; gaps are recorded as findings.

## Dependencies
Milestone 08 (authorization), all feature milestones (endpoints). Findings tracked in S3.
