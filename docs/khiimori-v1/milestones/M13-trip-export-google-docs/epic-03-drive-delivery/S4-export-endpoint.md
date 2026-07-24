# S4 — Export endpoint

> Epic: [M13.3 Drive delivery & one-doc-per-trip](README.md) · AC4.

## Goal

One endpoint that authorizes, builds, renders, delivers, and reports the result.

## Scope

- `POST /api/trips/:id/export/google-doc`, body `{ includePhotos?: bool,
  includeBudget?: bool, folderId?: string }`.
- **Authorization**: require trip access via the existing authorization service
  (owner/editor — viewers may be allowed since it's the *viewer's own* Drive;
  default to owner/editor for v1, note the choice).
- **Flow**: load the caller's Drive connection (E01·S2) → **409
  `drive_not_connected`** if absent → `BuildExportModel` (E02·S1) → render
  (E02·S2/S3) → resolve folder (S3) → reconcile create/update (S1/S2) → upsert
  mapping → `200 { doc_url, folder_url, exported_at }`.
- **Errors**: `ErrDriveDisconnected` → 409 `drive_reconnect_required`; render/drive
  failure → 502 with a safe message. No-store on error responses.
- Register in the trip module router / composition root, wiring the export reader
  set (E02·S1) and the Drive token source (E01).

## Acceptance

- [ ] Authorized export of a connected user returns a working `doc_url` and
      `folder_url`; the doc is in the right folder.
- [ ] Not connected → 409 `drive_not_connected`; revoked mid-flight → 409
      `drive_reconnect_required`.
- [ ] Unauthorized trip access → 403/404 per project convention.
- [ ] Integration test: connected user, real-ish (mock Drive) round-trip →
      mapping written, second call updates same doc.
</content>
