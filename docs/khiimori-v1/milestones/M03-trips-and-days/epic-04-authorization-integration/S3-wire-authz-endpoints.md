# S3 — Wire authorization into trip read/write paths

## Context
**Every trip read/write must call the `Authorizer`** before reading or writing, and unauthorized access
must yield `403`/`404` (not data) with no reliance on client-side checks (PRD §5.9, §6). This wires the
shim (S2) into the Trip module's endpoints (Epics 01/03) and the listing scoping (Epic 03 S2).

## Task
Apply the `Authorizer` check to all trip-scoped endpoints and the listing scope.

## Acceptance criteria
- [x] Every trip create/read/update/delete path calls the `Authorizer` with the right action before
  touching data.
- [x] **Unauthorized** access returns **`403`/`404`** (not data); no trip endpoint relies on client-side
  checks.
- [x] The listing endpoint (Epic 03 S2) is scoped via the same authz layer (a user sees only permitted
  trips).
- [x] The check uses the authenticated user from the Milestone 02 middleware (session-derived).

## Constraints
- Centralise the check (helper/middleware) so endpoints don't each reimplement it.
- Choose `403` vs `404` deliberately (avoid leaking existence where appropriate) and document the rule.

## Definition of done
All trip-scoped endpoints enforce the `Authorizer`; unauthorized requests get 403/404; listing is scoped.

## Dependencies
S1, S2, Epics 01 & 03 (endpoints/listing), Milestone 02 (auth user). Tested in S4.
