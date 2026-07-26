-- +goose Up
-- One-Google-Doc-per-trip-per-user mapping for the export feature (M13.3 S2).
-- Each row remembers the Drive file a user's export of a trip lives in, so a
-- re-export updates that same document in place rather than creating a new copy.
-- Per-user because each member exports into their OWN Google Drive.
--
-- Keyed by (trip_id, user_id). trip_id cascades with the trip; user_id has no
-- cross-schema FK to auth.users (matching trip.trips.owner_id — the trip schema
-- doesn't FK into the auth schema). app_rw is covered by the trip-schema default
-- privileges (migration 00008). folder_id/doc_url are cached for convenience.
CREATE TABLE trip.trip_exports (
    trip_id          uuid        NOT NULL REFERENCES trip.trips(id) ON DELETE CASCADE,
    user_id          uuid        NOT NULL,
    drive_file_id    text        NOT NULL,
    folder_id        text        NOT NULL DEFAULT '',
    doc_url          text        NOT NULL DEFAULT '',
    last_exported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (trip_id, user_id)
);

-- +goose Down
DROP TABLE trip.trip_exports;
