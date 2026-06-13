# S4 — 401 detection → re-auth

## Context
An expired session must trigger a **smooth re-auth** rather than a broken page: the app detects `401`
responses and routes the user back to sign-in (or refreshes) without losing their place where reasonable
(PRD §6, Epic 03 contract). Builds on the S1 context and the app's API client.

## Task
Add centralised `401` handling to the API layer that updates auth state and triggers re-auth.

## Acceptance criteria
- [ ] The app's API client detects **`401`** responses centrally (one interceptor/wrapper, not per-call).
- [ ] On `401`, the auth context is set to anonymous and the user is sent to sign-in (or a refresh is
  attempted if the mechanism supports it).
- [ ] The user's place is preserved where reasonable (return-to after re-auth).
- [ ] Non-401 errors are unaffected by this handling.

## Constraints
- Centralise the handling so every API call benefits; avoid ad-hoc per-request 401 checks.
- Match Epic 03's session/refresh mechanism (cookie vs token) for how re-auth is performed.

## Definition of done
An expired session is detected app-wide and leads to a smooth re-auth without a broken UI.

## Dependencies
S1 (context), S3 (redirect target), Epic 03 (401 contract / refresh).
