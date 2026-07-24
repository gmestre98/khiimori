# S1 — Drive OAuth consent flow (offline)

> Epic: [M13.1 Drive authorization & token store](README.md) · AC1.

## Goal

Stand up a **separate** authorization-code flow that obtains a Google refresh
token scoped to `https://www.googleapis.com/auth/drive.file`, without touching
the existing identity sign-in.

## Scope

- **Provider** (`auth/google.go` or a new `drive_oauth.go`): a second
  `oauth2.Config` with scope `drive.file`, its own redirect URI
  (`/api/integrations/google-drive/callback`), and `AuthCodeURL` built with
  `oauth2.AccessTypeOffline` + `oauth2.ApprovalForce` (`prompt=consent`) so
  Google always returns a refresh token — even on re-consent.
- **State/CSRF**: reuse the existing signed-state mechanism (`auth/state.go`);
  the callback validates state and requires an authenticated session (the
  connection is bound to the current user id).
- **Exchange**: swap the code for a token, keep `RefreshToken`, `AccessToken`,
  `Expiry`, and granted `scope`; hand off to S2 for persistence. Verify the
  returned scope actually contains `drive.file` (user can deselect on the consent
  screen) — if not, treat as a failed connect and surface a clear error.

Tokens/codes are never logged (existing S5 secrets-logging convention).

## Acceptance

- [x] Starting the flow redirects to Google's consent screen requesting
      `drive.file` with offline access and forced consent.
- [x] Callback validates CSRF state + session, and rejects a consent that did not
      grant `drive.file`.
- [x] On success a refresh token is captured and handed to the store (S2); no
      token material is logged.
- [x] Unit tests: URL contains the right scope/params; callback rejects bad
      state, unauthenticated session, and missing-scope grants.
</content>
