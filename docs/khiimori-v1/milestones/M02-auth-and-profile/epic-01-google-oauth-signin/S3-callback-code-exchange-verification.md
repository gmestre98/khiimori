# S3 — Callback: code exchange & ID-token verification

## Context
After consent, Google redirects back with a `code` and the `state`. The backend must verify `state`,
exchange the code for tokens, and **verify the ID token** (signature, audience, issuer, expiry, nonce)
before trusting the identity (PRD §6). Only then is a `VerifiedIdentity` produced for provisioning
(Epic 02) and session issuance (Epic 03).

## Task
Implement `Exchange` on the Google provider and a `GET /auth/callback` endpoint that verifies state,
exchanges the code, validates the ID token, and returns a `VerifiedIdentity`.

## Acceptance criteria
- [ ] `GET /auth/callback` verifies the returned `state` against the value stored in S2 and rejects a
  mismatch.
- [ ] The authorization code is exchanged for tokens; the **ID token signature, audience, issuer, expiry,
  and nonce** are all validated before the identity is trusted.
- [ ] A `VerifiedIdentity` (`google_sub`, `email`, `name`, `avatar`) is produced on success.
- [ ] On any verification failure the endpoint returns an auth error (no session issued, no user created).
- [ ] The callback hands the `VerifiedIdentity` to the provisioning seam (Epic 02) and session issuance
  (Epic 03) — stubbed/interface calls are acceptable until those land.

## Constraints
- Validate the token using the provider's published keys (JWKS) with caching as the library supports;
  never skip audience/issuer/expiry checks.
- Do not log the code, tokens, or raw claims (S5 enforces redaction).

## Definition of done
A valid callback yields a `VerifiedIdentity`; tampered state or an invalid ID token is rejected without
creating a session or user.

## Dependencies
S1, S2. Consumed by Epic 02 (provisioning) and Epic 03 (session). Tests in S4.
