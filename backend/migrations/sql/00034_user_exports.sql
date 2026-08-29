-- +goose Up
-- One-Google-Doc-per-user mapping for the "export all my trips" feature (M13.5).
-- Unlike trip.trip_exports (one doc per trip per user), the all-trips export is a
-- single combined document per user, so this is keyed by user_id alone. A
-- re-export updates that same document in place rather than creating a new copy.
-- user_id has no cross-schema FK to auth.users (matching trip.trips.owner_id and
-- trip.trip_exports — the trip schema doesn't FK into the auth schema). app_rw is
-- covered by the trip-schema default privileges (migration 00008).
CREATE TABLE trip.user_exports (
    user_id          uuid        NOT NULL PRIMARY KEY,
    drive_file_id    text        NOT NULL,
    folder_id        text        NOT NULL DEFAULT '',
    doc_url          text        NOT NULL DEFAULT '',
    last_exported_at timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE trip.user_exports;
