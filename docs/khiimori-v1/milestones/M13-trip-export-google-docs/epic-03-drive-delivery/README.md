# Epic M13.3 — Drive delivery & one-doc-per-trip

> **Status:** ✅ Done — all 4 stories shipped across PRs
> [#520](https://github.com/gmestre98/khiimori/pull/520) (S1 Drive client),
> [#521](https://github.com/gmestre98/khiimori/pull/521) (S2 mapping),
> [#522](https://github.com/gmestre98/khiimori/pull/522) (S3 folder), and
> [#523](https://github.com/gmestre98/khiimori/pull/523) (S4 endpoint).
> 4/4 ACs satisfied. Each PR was self-reviewed on GitHub and its findings fixed
> (S1 error-body snippet; S2 the FK/TRUNCATE ripple across 6 modules + a boundary
> violation; S3 no-recreate-on-transient-error; S4 the photo N+1). The full
> export backend now works end-to-end — proven by an ephemeral-DB integration
> test (create-then-update-the-same-doc). Drive is called over stdlib net/http
> (no new Go module); export is synchronous (EUR0-idle preserved).

> Milestone: [13 — Trip export to Google Docs](../README.md) · PRD refs: §7.0, §9.

## Description

Take the rendered HTML (E02) and the user's Drive token (E01) and **create or
update a Google Doc in the user's Drive**, in the right folder, keeping exactly
one document per trip per user. This epic owns the Drive HTTP calls, the
trip↔document mapping, folder resolution, and the public export endpoint.

Two Drive operations, both plain HTTPS with a `Bearer` access token from the
`oauth2.TokenSource` (no Google client library — milestone decision 2):

- **Create**: multipart upload to `/upload/drive/v3/files?uploadType=multipart`
  with metadata `{ name, mimeType: application/vnd.google-apps.document, parents:
  [folderId] }` and the `text/html` body → Drive converts HTML to a native Doc,
  returns the file id + `webViewLink`.
- **Update in place**: `PATCH /upload/drive/v3/files/{id}?uploadType=media` with
  the new `text/html` body replaces the doc's contents, same file id → re-export
  updates rather than duplicates.

## Acceptance Criteria

- [x] A Drive client (stdlib `net/http`) creates an HTML-sourced Google Doc and
      updates an existing one in place, using an access token from the token
      source; 401 refreshes, `invalid_grant` surfaces as disconnected. — **S1**
- [x] A `trip_exports` mapping records the Drive file id per (trip, user); export
      updates the mapped doc, and a deleted/trashed doc (404) is recreated. — **S2**
- [x] The target folder resolves to an app-created "Khiimori travelogues" folder
      by default (created once, id cached), or a caller-supplied folder id. — **S3**
- [x] `POST /api/trips/:id/export/google-doc` authorizes trip access, builds +
      renders + delivers, and returns `{ doc_url, folder_url, exported_at }`;
      not-connected → a typed 409 the UI turns into "Connect Drive". — **S4**

## User stories

| # | Story | Layer | Epic AC | Depends on |
|---|-------|-------|---------|-----------|
| [S1](S1-drive-client.md) | Drive REST client (create/update) | backend | AC1 | E01·S2 |
| [S2](S2-export-mapping.md) | `trip_exports` mapping + recreate | backend | AC2 | S1 |
| [S3](S3-folder-resolution.md) | Folder resolution (default + supplied) | backend | AC3 | S1 |
| [S4](S4-export-endpoint.md) | Export endpoint | backend | AC4 | S1, S2, S3, E02 |

### Sequencing

```
S1 drive client ─┬─ S2 mapping ──┐
                 └─ S3 folder ────┴─ S4 export endpoint
```

## Costs Impact

Per-export Drive API calls (free; counts against the *user's* Drive quota, not
ours). One additive table (`trip_exports`). Export runs synchronously in the
request — no worker/queue, €0-idle preserved. No new Go module.
</content>
