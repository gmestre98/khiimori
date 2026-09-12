-- +goose Up
-- Packing-list items — one row per thing to pack for a trip. A trip's packing
-- list is the set of rows sharing a trip_id, grouped in the UI by `category`
-- (e.g. "Safety gear", "Clothing"); an empty category reads as "Uncategorised".
--
-- No cross-schema FKs per migrations/README: trip_id references trip.trips by id
-- only. As with journal entries, rows left behind when a trip is deleted are
-- harmless — every read is scoped by trip_id, so an orphan is unreachable once
-- its trip is gone.
--
-- quantity defaults to 1 (a single item) and is constrained positive. note is a
-- short free-text qualifier ("the insulated pair, not the thin ones"). packed is
-- the check-off state. position orders items within the trip for a stable list.
CREATE TABLE packing.items (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    uuid        NOT NULL,                       -- application-level ref to trip.trips
    category   text        NOT NULL DEFAULT '',
    label      text        NOT NULL,
    quantity   integer     NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    note       text        NOT NULL DEFAULT '',
    packed     boolean     NOT NULL DEFAULT false,
    position   integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The list read is always "all items for a trip, ordered"; index the trip_id.
CREATE INDEX packing_items_trip_id_idx ON packing.items (trip_id);

-- +goose Down
DROP TABLE packing.items;
