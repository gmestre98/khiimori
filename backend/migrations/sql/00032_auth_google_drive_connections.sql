-- +goose Up
-- Per-user Google Drive connection for trip export (M13.1 S2). One row per user
-- who has connected Drive; the refresh token is stored ENCRYPTED (AES-GCM,
-- application-side) in refresh_token_enc — never in plaintext. The backend mints
-- short-lived access tokens from it on demand (an auto-refreshing TokenSource),
-- so exports can run without the user re-consenting each time.
--
-- Keyed by user_id (one Drive connection per user) and cascade-deleted with the
-- user. folder_id caches the app-created "Khiimori travelogues" folder id (or a
-- user-picked folder), populated by Epic 03; empty means "not resolved yet".
-- app_rw is granted automatically via the default privileges set in migration
-- 00008 for the auth schema.
CREATE TABLE auth.google_drive_connections (
    user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token_enc bytea       NOT NULL,
    scope             text        NOT NULL DEFAULT '',
    folder_id         text        NOT NULL DEFAULT '',
    connected_at      timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE auth.google_drive_connections;
