-- +goose Up
-- Persistent geocode cache (Epic M07.2 S2). Keyed on the normalised location
-- string; shared across all users (a location is not user-specific). A simple
-- TTL policy is enforced by the application (30 days); no background job is
-- required in v1 — stale rows are harmless and overwritten on next miss.
CREATE TABLE geo.geocode_cache (
    location   text        PRIMARY KEY,
    lat        double precision NOT NULL,
    lng        double precision NOT NULL,
    cached_at  timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS geo.geocode_cache;
