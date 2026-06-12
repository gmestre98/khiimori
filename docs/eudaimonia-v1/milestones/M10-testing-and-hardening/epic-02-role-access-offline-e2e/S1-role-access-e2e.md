# S1 — Role-based access E2E

## Context
E2E must exercise **role-based access**: an **Editor can edit**, a **Viewer is read-only**, and a
**non-member is denied** — proving the server-side authorization guarantee (PRD §5.9, §6, Milestone 08).

## Task
Implement an E2E scenario covering the three role outcomes on a shared trip.

## Acceptance criteria
- [ ] An E2E scenario sets up an owner + an invited **Editor** + a **Viewer** + a **non-member** (test
  identities) on a trip.
- [ ] The **Editor** can edit plan/budget/journal; the **Viewer** sees read-only (no edit affordance and
  edits rejected); the **non-member** is **denied** (no access).
- [ ] The test asserts **server-side** enforcement — it hits the API directly where useful to confirm
  unauthorized actions return `403`/`404`, not just hidden UI.
- [ ] Runs on the Epic 01 harness against staging.

## Constraints
- Use the multi-identity setup from disposable test accounts/invites.
- Assert at the API level for the authorization guarantee (UI hiding is not sufficient evidence).

## Definition of done
Role-based access (Editor/Viewer/non-member) is proven end-to-end with server-side assertions.

## Dependencies
Epic 01 (harness), Milestone 08 (roles/authorization). CI wiring in S3.
