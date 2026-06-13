# S1 — Profile read endpoint

## Context
An authenticated user can **view their profile** (PRD §5.7). This story exposes a read endpoint returning
the user's profile fields, operating on the `User` row from Epic 02 behind the auth middleware (Epic 03).

## Task
Add a `GET /me` (or `/profile`) endpoint returning the authenticated user's profile.

## Acceptance criteria
- [ ] The endpoint returns the authenticated user's `name`, `avatar`, `home_base`, theme preference (from
  `prefs`), and `default_currency`.
- [ ] It requires a valid session (Epic 03 middleware) and reads **only the authenticated user's own
  row** (from request context, not a client-supplied id).
- [ ] The response shape is documented/stable for the frontend (Epic 05) to consume.
- [ ] A unit test covers the read for an authenticated user.

## Constraints
- Never accept a user id from the client for "my profile" — derive it from the session (PRD §6).
- Read-only; no writes here.

## Definition of done
`GET /me` returns the signed-in user's profile fields; test green.

## Dependencies
Epic 02 (User row), Epic 03 (auth middleware). Consumed by Epic 05 S5.
