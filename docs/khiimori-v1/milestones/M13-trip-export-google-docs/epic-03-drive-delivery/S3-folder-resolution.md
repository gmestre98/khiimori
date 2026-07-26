# S3 — Folder resolution (default + supplied)

> Epic: [M13.3 Drive delivery & one-doc-per-trip](README.md) · AC3.

## Goal

Decide which Drive folder the doc lands in — an app-owned default, or a folder id
the caller supplies (from the Picker, Epic 04·S3).

## Scope

- **Default folder**: ensure a `Khiimori travelogues` folder exists in the user's
  Drive. Create it once via `POST /drive/v3/files` with `mimeType:
  application/vnd.google-apps.folder`; cache its id on the user's
  `google_drive_connections.folder_id` (E01·S2). `drive.file` can create and then
  reuse it. If the cached id 404s (user deleted the folder), recreate.
- **Supplied folder**: if the export request carries a `folder_id` (a folder the
  user granted via the Picker), use it as the `parents` target instead, and
  remember it on the trip's mapping so future exports of that trip default to the
  same place.
- Return a `folder_url` (`https://drive.google.com/drive/folders/{id}`) for the UI.

## Acceptance

- [x] With no folder supplied, the doc lands in `Khiimori travelogues` (created on
      first use, reused after).
- [x] A deleted default folder is recreated on the next export.
- [x] A supplied `folder_id` is used as the parent and remembered for the trip.
- [x] Unit tests: ensure-folder (create vs reuse vs recreate-on-404) and
      supplied-folder precedence.
</content>
