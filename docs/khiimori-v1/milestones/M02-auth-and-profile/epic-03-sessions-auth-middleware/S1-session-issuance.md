# S1 — Session issuance after sign-in

## Context
After a successful sign-in, an authenticated **session** must be issued for the provisioned user
(PRD §6). The mechanism — server-validated httpOnly secure cookie, or short-lived signed token +
refresh — is a design choice that must be **documented** and hidden behind a small interface so it can
change without touching callers (PRD §7.0). Consumes the user from Epic 02 and the verified flow from
Epic 01 S3.

## Task
Implement session issuance: mint a session for a user at the end of the OAuth callback and document the
chosen mechanism.

## Acceptance criteria
- [ ] A `Session` issuer mints an authenticated session for a given user at the end of `/auth/callback`.
- [ ] The chosen mechanism (httpOnly secure cookie **or** short-lived signed token + refresh) is
  implemented behind a small interface and **documented** in the story/epic.
- [ ] Session material is set correctly on the response (secure, httpOnly, SameSite as appropriate for a
  cookie; or returned token for the token approach).
- [ ] A unit test covers minting a session for a user and that the credential encodes the user identity.

## Constraints
- Signing/secret material is wired in S4 (Secret Manager) — use a config-provided key here, never
  hardcoded.
- Keep the issuer behind an interface so the validation middleware (S2) and sign-out (S3) share one seam.

## Definition of done
A successful callback issues a session for the provisioned user via a documented, interface-backed
mechanism; mint test is green.

## Dependencies
Epic 01 S3 (verified flow), Epic 02 S2 (provisioned user). Consumed by S2, S3, S4.
