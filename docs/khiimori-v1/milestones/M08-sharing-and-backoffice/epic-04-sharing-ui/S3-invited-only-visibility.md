# S3 — Invited-only trip visibility & tests

## Context
Invited users see **only trips shared with them** in their Trips menu — rendered from Milestone 03's
authorization-scoped listing, with the client never deciding authorization (PRD §5.9).

## Task
Verify and test that the Trips menu shows only authorized trips for invited users, and that the sharing UI
respects capabilities.

## Acceptance criteria
- [x] An invited Editor/Viewer sees the shared trip in their Trips menu (Milestone 03 scoped listing) and
  **not** trips they aren't a member of.
- [x] A Viewer sees read-only surfaces; an Editor sees edit affordances — but enforcement stays server-side
  (Epic 02).
- [x] UI/integration tests cover: invited user sees only shared trips, role-appropriate affordances, and
  that revocation removes the trip from their menu.
- [x] The client never filters/authorizes trips itself — it renders the server-scoped listing.

## Constraints
- Rely on Milestone 03's scoped listing (server decides visibility) — do not client-filter.
- Affordance visibility reflects capability but is not the security boundary (Epic 02 is).

## Definition of done
Invited users see only their shared trips with role-appropriate affordances; covered by green tests.

## Dependencies
S1, S2, Milestone 03 (scoped listing), Epic 02 (capabilities). Satisfies the epic's quality bar.
