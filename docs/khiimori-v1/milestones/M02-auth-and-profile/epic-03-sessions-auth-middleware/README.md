# Epic M02.3 — Sessions & auth middleware

> **Status:** ✅ Done — all 5 stories merged (PRs [#171](https://github.com/gmestre98/khiimori/pull/171)–[#175](https://github.com/gmestre98/khiimori/pull/175)) and all 5 acceptance criteria verified, including **live checks** against the deployed service (`/auth/session` → 401 `auth_required` unauthenticated; `/auth/logout` clears the `HttpOnly; Secure; SameSite=None` cookie; credentialed CORS for the web origin). Mechanism: a stateless HMAC-signed session cookie behind a small interface; see [backend/docs/sessions.md](../../../../../backend/docs/sessions.md).
>
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

- [x] On a successful sign-in, an **authenticated session/token** is issued for the provisioned user
      (httpOnly secure cookie or short-lived signed token + refresh — chosen mechanism documented)
      (PRD §6).
- [x] **Auth middleware** validates the session on every request and exposes the authenticated user
      to handlers; it is the single hook **every other module** uses (PRD §7.1).
- [x] **Missing or expired** credentials yield **`401`**; the client can detect this and re-auth; no
      protected handler runs without a valid session (PRD §6).
- [x] **Sign-out** invalidates the session client-side (and server-side if the mechanism is
      stateful), so a signed-out credential no longer authenticates.
- [x] Unit + integration tests cover valid/expired/missing sessions, the `401` path, and sign-out
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

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-session-issuance.md) | Session issuance after sign-in | ~3.5h | AC1 | Epic 01 S3, Epic 02 S2 |
| [S2](S2-auth-middleware.md) | Auth middleware: validate session, attach user, 401 | ~3.5h | AC2, AC3 | S1 (M01.2) |
| [S3](S3-sign-out.md) | Sign-out / session invalidation | ~2.5h | AC4 | S1, S2 |
| [S4](S4-session-secret-expiry.md) | Session secret from Secret Manager & expiry/refresh | ~2.5h | AC1 | S1 (M01.4) |
| [S5](S5-session-middleware-tests.md) | Session & middleware tests | ~3h | AC5 | S1–S4 |

**Total:** ~15h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Session issuance ──┬─ S2 Auth middleware ──┐
                      ├─ S3 Sign-out ─────────┤
                      └─ S4 Secret & expiry ───┴─ S5 Tests
```
