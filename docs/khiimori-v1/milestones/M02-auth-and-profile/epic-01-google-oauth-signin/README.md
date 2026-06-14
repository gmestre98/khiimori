# Epic M02.1 — Google OAuth sign-in (OIDC authorization-code flow)

> **Status:** ✅ Done — all 6 stories merged (PRs [#157](https://github.com/gmestre98/khiimori/pull/157)–[#164](https://github.com/gmestre98/khiimori/pull/164)) and all 5 acceptance criteria verified. The flow is live behind `/auth/login` + `/auth/callback`; see [backend/docs/oauth-signin.md](../../../../../backend/docs/oauth-signin.md).
>
> Milestone: [02 — Auth & Profile](../README.md) · PRD refs: §5.8, §6, §7.0, §8.5.

## Description

Implement **Google SSO** as the only authentication method in v1. The backend runs the OAuth 2.0 /
OpenID Connect **authorization-code flow**: it builds the Google consent URL, handles the redirect
callback, exchanges the code for tokens, and verifies the ID token to obtain a trustworthy
`google_sub`, `email`, `name`, and `avatar`. Google is wrapped behind a thin internal
`IdentityProvider` interface so the provider can be swapped later without touching callers
(PRD §7.0). All OAuth secrets live only in Secret Manager and are never logged.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] An **`IdentityProvider` interface** wraps Google OAuth/OIDC; the v1 implementation runs the
      **authorization-code flow** (build consent URL → handle callback → exchange code → verify ID
      token) (PRD §5.8, §7.0).
- [x] The verified identity yields `google_sub`, `email`, `name`, `avatar`; ID-token signature,
      audience, issuer, and expiry are validated before the identity is trusted (PRD §6).
- [x] **CSRF/replay protection** on the flow (state parameter and nonce) and exact-match of the
      authorized redirect URI.
- [x] OAuth **client ID/secret and any signing material come from config/Secret Manager**, never
      hardcoded, and tokens/codes are **never logged** (PRD §6, §8.5).
- [x] Unit tests cover token verification (valid, expired, wrong audience/issuer, bad signature)
      against the `IdentityProvider` interface with the network boundary mocked (PRD §7.6).

## Implementation Details / Architecture

- Lives in the **`auth` module** (PRD §7.1). The `IdentityProvider` interface keeps Google behind a
  seam: `AuthCodeURL(state, nonce)` and `Exchange(code) → VerifiedIdentity`.
- The callback hands the verified identity to provisioning (Epic 02) and session issuance (Epic 03);
  this epic owns only the provider integration, not the user row or the session.
- Redirect URIs and client credentials are author-provided in the Google Cloud console and injected
  via the platform config loader (M01.2 S1) reading Secret Manager (M01.4).

## Dependencies

- **Upstream:** M01.2 (config loader, HTTP server), M01.4 (Secret Manager). Google OAuth client
  ID/secret + authorized redirect URIs are author-provided.
- **Downstream:** Epic 02 (provisioning) consumes the verified identity; Epic 03 (sessions) issues a
  session after a successful flow; Epic 05 starts the flow from the web app.

## Costs Impact

Negligible. Google OAuth is free; no new billable component (PRD §8 — within free tier).

## Designs

Sign-in is a simple surface using the black/white theme (PRD §5.10); the redirect flow has no
bespoke UI beyond the Google consent screen and a return landing handled in Epic 05.

## User stories

The epic is split into **6 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt — hand a single file to a coding
agent and it has enough context (background, task, acceptance criteria, constraints, dependencies,
definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-identity-provider-interface.md) | `IdentityProvider` interface & Google provider scaffold | ~3h | AC1 | — (M01.1, M01.2) |
| [S2](S2-authorization-code-consent-url.md) | Authorization-code consent URL (state + nonce) | ~3h | AC1, AC3 | S1 |
| [S3](S3-callback-code-exchange-verification.md) | Callback: code exchange & ID-token verification | ~3.5h | AC1, AC2, AC3 | S1, S2 |
| [S4](S4-token-verification-tests.md) | Token-verification unit tests | ~3h | AC5 | S3 |
| [S5](S5-secrets-and-no-logging.md) | OAuth secrets via Secret Manager & no-logging | ~2.5h | AC4 | S1–S3 (M01.4) |
| [S6](S6-document-oauth-signin.md) | Document the OAuth sign-in story | ~2h | — | S1–S5 |

**Total:** ~17h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Interface ── S2 Consent URL ── S3 Callback & verification ──┬─ S4 Verification tests
                                                               └─ S5 Secrets & no-logging
S6 Document ◄── needs S1–S5
```
