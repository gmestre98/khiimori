# S5 — Profile screen (view/edit, EUR display)

## Context
A **Profile screen** views and edits name, avatar, home base, and theme preference via Epic 04, and
**displays EUR** as a non-editable field; changes **persist and reflect immediately** (PRD §5.7, §11.5).
Builds on the auth context (S1) and Epic 04's profile API.

## Task
Build the Profile screen that reads and edits the profile through Epic 04.

## Acceptance criteria
- [ ] The screen loads the profile via `GET /me` (Epic 04 S1) and shows `name`, `avatar`, `home_base`,
  theme preference, and `default_currency`.
- [ ] Editing `name`, `avatar`, `home_base`, and theme saves via `PATCH /me` (Epic 04 S2) and reflects
  immediately in the UI.
- [ ] `default_currency` is shown as **EUR** and is **not editable** (no input control for it).
- [ ] The screen is responsive (web + mobile) with basic styling now; Milestone 09 components later.
- [ ] Save errors (validation) are surfaced clearly to the user.

## Constraints
- Selecting a theme persists via the profile API (feeds Milestone 09 theming) — do not store it only in
  local state.
- The screen renders inside the gated app (S3); it requires authentication.

## Definition of done
A signed-in user can view and edit their profile from the screen, EUR shows as read-only, and changes
persist immediately.

## Dependencies
S1 (context), S3 (gated route), Epic 04 (profile read/edit API).
