# S4 — Authorization tests (owner allowed / non-owner denied)

## Context
Epic AC4 requires unit + integration tests covering owner-allowed and non-owner-denied paths across
create/read/update/delete and the listing (PRD §7.6). Authorization guards all trip data, so it gets
explicit coverage even with the v1 shim.

## Task
Add tests proving authorization is enforced on trip-scoped operations.

## Acceptance criteria
- [x] Integration tests cover: owner can create/read/update/delete their trip; a non-owner is **denied
  (403/404)** on each.
- [x] A test asserts the **listing** returns only trips the user may see.
- [x] Tests run through the endpoints with the auth middleware so session-derived identity + authz are
  exercised together.
- [x] A test documents the chosen `403` vs `404` behaviour.

## Constraints
- Reuse the M01.3 integration harness and Milestone 02 test sessions.
- Structure tests so they keep passing when Milestone 08 swaps the shim for the membership `Authorizer`
  (assert behaviour, not shim internals).

## Definition of done
Owner/non-owner enforcement across CRUD + listing is covered by green tests resilient to the Milestone 08
swap.

## Dependencies
S1–S3, M01.3 S7 (harness), Milestone 02 (sessions). Satisfies epic AC4.
