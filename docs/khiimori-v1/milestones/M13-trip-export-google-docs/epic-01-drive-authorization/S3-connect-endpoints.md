# S3 — Connect / disconnect / status endpoints

> Epic: [M13.1 Drive authorization & token store](README.md) · AC3.

## Goal

Expose the Drive integration to the frontend as three authenticated endpoints.

## Scope

- `GET  /api/integrations/google-drive`  → `{ connected: bool, connected_at?,
  folder_name? }`. Never returns token material.
- `POST /api/integrations/google-drive/connect` → starts S1's flow (returns the
  consent redirect URL, or 302). Binds to the session user.
- `GET  /api/integrations/google-drive/callback` → S1 callback → store (S2) →
  redirect back to the app settings page with a success/failure flag.
- `POST /api/integrations/google-drive/disconnect` → best-effort token
  **revocation** at Google's revoke endpoint, then delete the stored row. 204.
- Wire into the auth module router; all require an authenticated session; standard
  no-store on error responses (same-origin `/api` convention).

## Acceptance

- [ ] Status reflects connected/disconnected accurately and omits secrets.
- [ ] Connect → consent → callback persists a connection and redirects with a
      success flag; a denied/failed consent redirects with a failure flag.
- [ ] Disconnect revokes at Google and removes the row; status flips to
      disconnected.
- [ ] Handler tests cover unauthenticated (401), happy path, and disconnect.
</content>
