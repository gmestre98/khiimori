# S2 — Authorization-code consent URL (state + nonce)

## Context
The OAuth **authorization-code flow** starts by redirecting the user to Google's consent screen with a
correctly built URL (PRD §5.8). CSRF/replay protection requires a **state** parameter and an OIDC
**nonce**, and the **redirect URI must exactly match** an authorized one (PRD §6). This story implements
`AuthCodeURL` on the Google provider (S1) and the endpoint that begins sign-in.

## Task
Implement consent-URL construction (state + nonce, exact redirect URI, scopes) and a `GET /auth/login`
endpoint that issues the redirect.

## Acceptance criteria
- [ ] `AuthCodeURL` produces a valid Google authorization-code URL with the configured client ID, exact
  redirect URI, and the scopes needed for `email`/`profile`/OIDC.
- [ ] A cryptographically random **state** and **nonce** are generated per request and stored so the
  callback (S3) can verify them (e.g. short-lived signed cookie / server-side store).
- [ ] A `GET /auth/login` endpoint redirects the browser to the consent URL.
- [ ] Unit tests cover URL construction (params present/correct) and that state/nonce are random per call.

## Constraints
- State and nonce must be unguessable; do not reuse across requests. Keep the storage mechanism behind a
  small helper so S3 reads it the same way.
- Exact redirect-URI match — no trailing-slash or scheme drift (a top cause of OAuth misconfig).

## Definition of done
Hitting `/auth/login` redirects to Google with a correct URL carrying a fresh state + nonce; unit tests
are green.

## Dependencies
S1 (provider interface + Google scaffold). Consumed by S3 (callback verifies state/nonce).
