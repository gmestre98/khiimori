# Epic M02.3 — Sessions & auth middleware

> Milestone: [02 — Auth & Profile](../README.md) · PRD refs: §6, §7.0, §7.1.

## Description

Issue an authenticated **session** after a successful sign-in and validate it on **every request**
through shared **auth middleware** that every other module's handlers reuse. Missing or expired
credentials yield `401` so the client can detect this and re-authenticate. A **sign-out** path
invalidates the session client-side (and server-side where applicable). The chosen mechanism
(server-validated httpOnly secure cookie, or a short-lived signed token + refresh) is documented and
hidden behind the middleware so it can change without touching callers (PRD §7.0).

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] On a successful sign-in, an **authenticated session/token** is issued for the provisioned user
      (httpOnly secure cookie or short-lived signed token + refresh — chosen mechanism documented)
      (PRD §6).
- [ ] **Auth middleware** validates the session on every request and exposes the authenticated user
      to handlers; it is the single hook **every other module** uses (PRD §7.1).
- [ ] **Missing or expired** credentials yield **`401`**; the client can detect this and re-auth; no
      protected handler runs without a valid session (PRD §6).
- [ ] **Sign-out** invalidates the session client-side (and server-side if the mechanism is
      stateful), so a signed-out credential no longer authenticates.
- [ ] Unit + integration tests cover valid/expired/missing sessions, the `401` path, and sign-out
      (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`auth` module** (PRD §7.1); session signing/validation material comes from Secret
  Manager (M01.4) and is never logged (PRD §6, §8.5).
- The middleware establishes **authentication only** (who you are). **Trip authorization** (what you
  may touch) is layered on top by the Sharing module in Milestone 08, which consumes the
  authenticated user this middleware attaches (PRD §5.9).
- Session expiry/refresh are set with mobile-while-abroad use in mind (re-auth must be smooth, not a
  hard logout mid-trip).

## Dependencies

- **Upstream:** Epic 01 (successful sign-in), Epic 02 (provisioned user to put in the session),
  M01.2 (HTTP middleware chain), M01.4 (signing secret).
- **Downstream:** every protected endpoint in Milestones 03–10 wraps with this middleware; Epic 05
  consumes the `401` contract to drive re-auth.

## Costs Impact

Negligible. No new billable component (PRD §8 — within free tier).

## Designs

No bespoke UI; the client-side handling of `401`/sign-out lives in Epic 05's auth context.
