# S1 — `IdentityProvider` interface & Google provider scaffold

## Context
Sign-in is **Google SSO / OAuth only** in v1 (PRD §5.8). To keep Google swappable (PRD §7.0), the `auth`
module wraps it behind a thin internal **`IdentityProvider` interface** rather than calling Google
directly from handlers. This story defines that seam and a Google OIDC provider scaffold; the consent URL
(S2) and callback (S3) fill in the behaviour. Assumes the platform config loader (M01.2 S1) and `auth`
module skeleton (M01.1 S3) exist.

## Task
Add an `IdentityProvider` interface to the `auth` module with a Google OIDC implementation scaffold (no
network behaviour yet) constructed from config.

## Acceptance criteria
- [ ] An `IdentityProvider` interface exposes the two operations the flow needs: build an auth-code URL
  (`AuthCodeURL(state, nonce) → url`) and exchange a code for a verified identity
  (`Exchange(ctx, code) → VerifiedIdentity`).
- [ ] A `VerifiedIdentity` type carries `google_sub`, `email`, `name`, `avatar`.
- [ ] A Google OIDC implementation is constructed from config (client ID, redirect URI, issuer/discovery
  endpoint) — values read from config, never hardcoded.
- [ ] The implementation is wired behind the interface so callers depend only on the interface (PRD §7.0).
- [ ] A unit test constructs the provider from a fake config and asserts the interface is satisfied.

## Constraints
- A Google OAuth/OIDC client library is a likely third-party dependency. **Confirm the specific library
  with the author and record it here before adding it** (project rule: stdlib-first, ask before deps).
- No secrets in code; client secret handling is S5. No domain/user logic here — this is the provider seam.

## Definition of done
The `auth` module exposes an `IdentityProvider` interface with a config-built Google scaffold; the
interface-satisfaction unit test is green.

## Dependencies
M01.1 S3 (`auth` module skeleton), M01.2 S1 (config loader). Consumed by S2, S3.
