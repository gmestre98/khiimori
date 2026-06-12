# S4 — Token-verification unit tests

## Context
Epic AC5 requires unit tests covering ID-token verification (valid, expired, wrong audience/issuer, bad
signature) with the network boundary mocked (PRD §7.6). Token verification is the trust boundary of the
whole auth system, so it gets focused coverage.

## Task
Add unit tests for the ID-token verification logic in S3, mocking the provider/JWKS boundary.

## Acceptance criteria
- [ ] A **valid** ID token passes and yields the expected `VerifiedIdentity` claims.
- [ ] An **expired** token is rejected.
- [ ] A token with the **wrong audience** is rejected.
- [ ] A token with the **wrong issuer** is rejected.
- [ ] A token with a **bad/incorrect signature** is rejected.
- [ ] A **state mismatch** on the callback is rejected (CSRF guard from S2/S3).

## Constraints
- Mock the network/JWKS boundary (no live calls to Google); generate test tokens with a test key.
- Tests assert behaviour through the `IdentityProvider`/callback surface, not internal helpers, so the
  contract is what's verified.

## Definition of done
All six cases above are covered by green unit tests with no network dependency.

## Dependencies
S3 (verification logic). Satisfies epic AC5.
