# S2 — Profile edit endpoint

## Context
A user can **edit** name, avatar, home base, and theme preference, and changes **persist and reflect
immediately** (PRD §5.7). Builds on S1's read and the `User` row from Epic 02.

## Task
Add an edit endpoint (`PATCH /me`) that updates the editable profile fields.

## Acceptance criteria
- [ ] The endpoint updates `name`, `avatar`, `home_base`, and theme preference (stored in `prefs` JSONB).
- [ ] Updates apply to **only the authenticated user's own row** (session-derived id).
- [ ] The updated profile is returned (or readable immediately via S1) so the client reflects changes at
  once.
- [ ] Input is validated (e.g. reasonable lengths, allowed theme values); invalid input is rejected with
  a clear error.
- [ ] A unit test covers a successful edit and a rejected invalid edit.

## Constraints
- `default_currency` is **not** editable here — that is enforced in S3.
- Identity-sourced fields refreshed at sign-in (Epic 02 S3) must not be clobbered in a way that breaks the
  documented precedence; user edits to `name`/`avatar` are allowed and persist.

## Definition of done
`PATCH /me` updates the editable fields for the signed-in user and reflects immediately; tests green.

## Dependencies
S1, Epic 02 (User), Epic 03 (middleware). Currency rule in S3.
