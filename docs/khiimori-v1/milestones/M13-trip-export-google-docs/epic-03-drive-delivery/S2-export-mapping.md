# S2 — `trip_exports` mapping + recreate

> Epic: [M13.3 Drive delivery & one-doc-per-trip](README.md) · AC2.

## Goal

Keep exactly one Google Doc per (trip, user) by remembering the Drive file id and
updating it on re-export — recreating if the user deleted it.

## Scope

- **Migration** `000XX_trip_exports.sql` (trip schema): `trip_exports (trip_id
  uuid, user_id uuid, drive_file_id text NOT NULL, folder_id text, doc_url text,
  last_exported_at timestamptz, PRIMARY KEY (trip_id, user_id))`. Per-user because
  each member exports into *their own* Drive.
- **Store**: `getMapping(tripID, userID)`, `upsertMapping(...)`.
- **Reconcile logic** (used by S4): if a mapping exists → `UpdateDoc`; if that
  returns `ErrDocMissing` (user trashed it) → `CreateDoc` and overwrite the
  mapping; if no mapping → `CreateDoc` + insert.

## Acceptance

- [x] First export inserts a mapping; second export of the same trip updates the
      same doc (id unchanged), no duplicate created.
- [x] A deleted doc (404) is recreated and the mapping updated to the new id.
- [x] Two different users exporting the same shared trip get separate docs in
      their own Drives.
- [x] Store integration test for upsert + read; unit test for the reconcile
      branch (update / recreate / create).
</content>
