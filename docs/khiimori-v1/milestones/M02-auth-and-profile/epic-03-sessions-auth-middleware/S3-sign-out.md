# S3 — Sign-out / session invalidation

## Context
A **sign-out** must invalidate the session so a signed-out credential no longer authenticates —
client-side always, and server-side if the mechanism is stateful (PRD §6). Builds on S1/S2.

## Task
Implement a sign-out endpoint that invalidates the current session.

## Acceptance criteria
- [ ] A `POST /auth/logout` (or equivalent) endpoint clears the session client-side (e.g. expires the
  cookie / instructs the client to drop the token).
- [ ] If the mechanism is **stateful** (server-side session store or refresh token), the session is also
  invalidated server-side so it cannot be reused.
- [ ] After sign-out, a request with the old credential is rejected with `401` by the S2 middleware.
- [ ] A unit/integration test covers that a signed-out credential no longer authenticates.

## Constraints
- Match the mechanism chosen in S1 (cookie vs token + refresh); document any server-side revocation store.
- Sign-out must be safe to call when already signed out (idempotent).

## Definition of done
Sign-out invalidates the session; the prior credential yields `401`; test is green.

## Dependencies
S1, S2. Consumed by the frontend sign-out (Epic 05).
