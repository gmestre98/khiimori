# S2 — Sign-in / sign-out UI

## Context
Users need a **sign-in affordance** that starts the Google flow and a **sign-out** affordance that ends
the session, both on web and mobile (PRD §5.8). Builds on the auth context (S1), Epic 01's `/auth/login`,
and Epic 03's sign-out.

## Task
Add sign-in and sign-out UI wired to the backend flow.

## Acceptance criteria
- [ ] A **sign-in** control starts the Google flow (navigates to `/auth/login` from Epic 01) and returns
  the user to the app authenticated.
- [ ] A **sign-out** control calls the backend sign-out (Epic 03 S3) and clears local auth state via the
  S1 context.
- [ ] Both controls work on web and mobile layouts (basic styling now; Milestone 09 components later).
- [ ] After sign-in/out, the UI reflects the new state immediately (via the S1 context).

## Constraints
- Do not implement a custom credential form — Google SSO only (PRD §5.8).
- Handle the post-redirect landing so the app picks up the new session and updates context.

## Definition of done
A user can sign in via Google and sign out from the web app; auth state updates immediately.

## Dependencies
S1 (context), Epic 01 (`/auth/login`), Epic 03 S3 (sign-out).
