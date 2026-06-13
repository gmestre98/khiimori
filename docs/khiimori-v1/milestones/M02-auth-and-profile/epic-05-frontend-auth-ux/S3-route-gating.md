# S3 — Protected route gating & redirect

## Context
Protected screens must stay behind a valid session: the auth context **gates routes** and redirects
unauthenticated users to sign-in (PRD §6). Builds on S1.

## Task
Add route gating that protects authenticated areas and redirects anonymous users.

## Acceptance criteria
- [ ] A route guard renders protected routes only when `status === authenticated`; anonymous users are
  redirected to the sign-in surface.
- [ ] While auth state is `loading`, a sensible placeholder is shown (no flicker of protected content).
- [ ] After signing in, the user is returned to their intended destination where reasonable.
- [ ] Public routes (sign-in/landing) remain reachable when anonymous.

## Constraints
- Gating is a UX convenience — **server-side enforcement is authoritative** (the API still rejects
  unauthenticated calls with 401). Do not rely on the client guard for security (PRD §6).
- Reuse the S1 context; no duplicate auth-state logic.

## Definition of done
Protected routes require authentication client-side and redirect anonymous users; intended-destination
return works.

## Dependencies
S1 (context), S2 (sign-in surface to redirect to).
