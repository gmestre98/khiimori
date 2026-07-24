# S1 — Drive REST client (create/update)

> Epic: [M13.3 Drive delivery & one-doc-per-trip](README.md) · AC1.

## Goal

A thin Drive client over stdlib `net/http` that creates an HTML-sourced Google
Doc and updates one in place, authenticated by an `oauth2.TokenSource`.

## Scope

- **`internal/export/drive.go`** (or an `internal/gdrive` helper): `CreateDoc(ctx,
  ts, name, folderID, html) (fileID, webViewLink, error)` and `UpdateDoc(ctx, ts,
  fileID, html) error`.
- **Create**: `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=
  multipart&fields=id,webViewLink` — multipart body: part 1 JSON metadata
  (`name`, `mimeType: application/vnd.google-apps.document`, `parents:[folderID]`),
  part 2 `text/html` content. Drive converts on ingest.
- **Update**: `PATCH …/upload/drive/v3/files/{id}?uploadType=media` with the new
  `text/html` body (keeps id, name, parents).
- **Auth**: `ts.Token()` → `Authorization: Bearer`. On 401 the token source has
  already tried refresh; map a hard auth failure / `invalid_grant` to
  `ErrDriveDisconnected` (E01·S2). Map 404 on update to `ErrDocMissing` (for S2's
  recreate).
- Reasonable per-request timeout; response bodies capped; no token logging.

## Acceptance

- [ ] Create returns a real file id + `webViewLink`; the file opens as an editable
      Google Doc with the rendered structure.
- [ ] Update replaces contents of an existing doc, same id/URL.
- [ ] 404-on-update → `ErrDocMissing`; auth failure → `ErrDriveDisconnected`.
- [ ] Tested against a mock Drive HTTP server (create, update, 404, 401 paths).
</content>
