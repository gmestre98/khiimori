# S1 — Role-based access E2E

## Context
E2E must exercise **role-based access**: an **Editor can edit**, a **Viewer is read-only**, and a
**non-member is denied** — proving the server-side authorization guarantee (PRD §5.9, §6, Milestone 08).

## Task
Implement an E2E scenario covering the three role outcomes on a shared trip.

## Acceptance criteria
- [x] An E2E scenario sets up an owner + an invited **Editor** + a **Viewer** + a **non-member** (test
  identities) on a trip. — `e2e/tests/role-access.spec.ts` + `e2e/lib/identities.ts`; the four fixed,
  non-admin identities come from the guarded `POST /auth/test-login?identity=…`, and the Editor/Viewer
  join via the real invite → accept flow.
- [x] The **Editor** can edit plan/budget/journal; the **Viewer** sees read-only (no edit affordance and
  edits rejected); the **non-member** is **denied** (no access). — editor writes → 2xx; viewer read →
  200 but writes → 404; non-member → 404; plus a viewer read-only check on the sharing page's owner-only
  affordances.
- [x] The test asserts **server-side** enforcement — it hits the API directly where useful to confirm
  unauthorized actions return `403`/`404`, not just hidden UI. — deny-by-default is 404 (`trip_not_found`,
  no existence leak), asserted via direct API calls per identity.
- [x] Runs on the Epic 01 harness against staging. — same Playwright harness/auth/storageState, run via
  `npm test` in the post-merge `e2e` CI stage (wiring in S3).

## Constraints
- Use the multi-identity setup from disposable test accounts/invites.
- Assert at the API level for the authorization guarantee (UI hiding is not sufficient evidence).

## Definition of done
Role-based access (Editor/Viewer/non-member) is proven end-to-end with server-side assertions. ✅ Done — PR #411.

## Dependencies
Epic 01 (harness), Milestone 08 (roles/authorization). CI wiring in S3.
