# S2 — Encrypted refresh-token store + token source

> Epic: [M13.1 Drive authorization & token store](README.md) · AC2.

## Goal

Persist Drive refresh tokens **encrypted at rest**, one per user, and expose an
auto-refreshing `oauth2.TokenSource` so later export requests get a valid access
token without user interaction.

## Scope

- **Migration** `000XX_google_drive_connections.sql` (auth schema):
  `google_drive_connections (user_id uuid PK → auth.users, refresh_token_enc
  bytea NOT NULL, scope text NOT NULL, connected_at timestamptz, folder_id text
  NULL, updated_at timestamptz)`. `folder_id` caches the app-created target
  folder (Epic 03).
- **Encryption**: envelope-encrypt the refresh token with a key from Secret
  Manager (or Cloud KMS `Encrypt`/`Decrypt`). AES-GCM via stdlib `crypto/aes` +
  `crypto/cipher`; the key is injected via config (`khiimori:driveTokenKey` →
  env), consistent with existing secret wiring. Never store the plaintext token.
- **Store** (`drive_connection_store.go`): upsert (connect/reconnect), load,
  delete. Load returns a `TokenSource` built from the decrypted refresh token via
  `oauthCfg.TokenSource(ctx, &oauth2.Token{RefreshToken: ...})`, which refreshes
  access tokens on demand and, if Google rotates the refresh token, writes the
  new one back (persist-on-refresh via a wrapping `TokenSource`).
- **Revocation handling**: if a refresh fails with `invalid_grant` (user revoked
  access at Google), surface a typed `ErrDriveDisconnected` so callers can prompt
  reconnect and the row can be cleaned up.

## Acceptance

- [x] Refresh token is stored only in encrypted form; a DB dump reveals no usable
      token.
- [x] Loading a connection yields a `TokenSource` that returns a fresh access
      token; a rotated refresh token is persisted back.
- [x] `invalid_grant` maps to `ErrDriveDisconnected`.
- [x] Store integration test (round-trip encrypt/decrypt, upsert overwrite,
      delete) + unit test for the persist-on-refresh wrapper.
</content>
