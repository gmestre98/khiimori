# Epic M13.1 — Drive authorization & token store

> **Status:** ✅ Done — all 4 stories shipped across PRs
> [#511](https://github.com/gmestre98/khiimori/pull/511) (S1 OAuth flow),
> [#512](https://github.com/gmestre98/khiimori/pull/512) (S2 encrypted token store),
> [#513](https://github.com/gmestre98/khiimori/pull/513) (S3 endpoints), and
> [#514](https://github.com/gmestre98/khiimori/pull/514) (S4 connection UI).
> 4/4 ACs satisfied. Each PR was self-reviewed on GitHub and its findings fixed
> (S1 transient-vs-declined errors + exchange timeout + shared HMAC helpers; S2
> no startup panic on a bad key; S3 handler guards + response-body drain + the
> errcheck lint; S4 honest load-failed state), and the S4 UI was verified in a
> browser in light and dark. New: `drive.file` offline consent separate from
> sign-in, AES-256-GCM refresh-token store (migration 00032), connect/callback/
> status/disconnect endpoints, and a Drive card on the profile page. No new Go
> module (Drive revoke over stdlib net/http); €0-idle posture unchanged.

> Milestone: [13 — Trip export to Google Docs](../README.md) · PRD refs: §6, §7.0.

## Description

Sign-in today keeps only the ID-token identity claims and throws the OAuth token
away (`auth/google.go`, scopes `openid email profile`). To write to a user's
Drive we need a **second, explicitly-consented authorization** carrying the
`drive.file` scope and an **offline refresh token**, stored encrypted so the
backend can mint access tokens later without the user present. This is a
first-class "Connect Google Drive" integration, deliberately kept separate from
the sign-in flow so that:

- existing users (who only granted email/profile) opt in when they want export;
- revoking Drive access never logs the user out;
- the sensitive Drive scope is only ever requested from users who ask for it.

## Acceptance Criteria

- [x] A dedicated authorization flow requests `drive.file` with
      `access_type=offline` + `prompt=consent` and captures a refresh token,
      independent of the identity sign-in flow. — **S1**
- [x] Refresh tokens are persisted **encrypted at rest**, keyed per user, and can
      be loaded into an auto-refreshing `oauth2.TokenSource`. — **S2**
- [x] Connect / disconnect / status endpoints exist; disconnect revokes at Google
      and deletes the stored token; status never leaks token material. — **S3**
- [x] The profile/settings surface shows Drive connection status with connect and
      disconnect actions. — **S4**

## User stories

| # | Story | Layer | Epic AC | Depends on |
|---|-------|-------|---------|-----------|
| [S1](S1-drive-oauth-flow.md) | Drive OAuth consent flow (offline) | backend | AC1 | — |
| [S2](S2-token-store.md) | Encrypted refresh-token store + token source | backend | AC2 | S1 |
| [S3](S3-connect-endpoints.md) | Connect/disconnect/status endpoints | backend | AC3 | S2 |
| [S4](S4-connection-ui.md) | Frontend Drive connection UI | frontend | AC4 | S3 |

### Sequencing

```
S1 oauth flow ── S2 token store ── S3 endpoints ── S4 connection UI
```

## Costs Impact

Enables the **Google Drive API** on the GCP project (free; per-user Drive quota,
not billed to us) and adds a **token-encryption key** in Secret Manager /
Cloud KMS. No compute added — €0-idle preserved. No new Go module (see milestone
decision 2). **Requires OAuth consent-screen changes:** adding `drive.file` (a
"sensitive" scope) means the app either stays in *testing* mode (capped, manual
test-user list) or goes through Google's app **verification/brand review** before
external users can connect — a process gate, not a code change (see Drawbacks).
</content>
