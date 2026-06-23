-- +goose Up
-- The Stay entity (PRD §9, §5.2), owned by the trip module. Accommodation is
-- modelled as stays with check-in/out dates that may span multiple calendar days
-- without per-night duplication. Each stay is entered once and derived at read
-- time to cover every date in [check_in, check_out) — Epic M04.1 S3 implements
-- the spanning logic.
--
-- trip_id references trip.trips with a cascading delete: when a trip is removed
-- all its stays disappear atomically with no orphan cleanup needed.
--
-- name is required (useful identification of the stay); location, check_in,
-- check_out, cost, and link are optional (a stay with name + dates is minimal
-- but complete; other fields layer on as needed — PRD §5.2).
--
-- cost is a numeric field owned by this module. Milestone 05 (budget roll-ups)
-- reads it through the Trip module interface — no cross-schema FK (migrations/README.md),
-- and no budget computation here (cost is a source, not a derived field).
--
-- location, when present, feeds Milestone 07's map pins; it holds a place name or
-- description, not structured geography.
--
-- link is a URL (hotel booking, Airbnb listing, etc.) and is plain text,
-- validated and normalized by the application layer.
CREATE TABLE trip.stays (
    id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id   uuid    NOT NULL REFERENCES trip.trips (id) ON DELETE CASCADE,
    name      text    NOT NULL,
    location  text,
    check_in  date,
    check_out date,
    cost      numeric,
    link      text
);

-- Per-trip reads (listing all stays for a trip) filter on trip_id.
CREATE INDEX stays_trip_id_idx ON trip.stays (trip_id);

-- +goose Down
DROP TABLE trip.stays;
