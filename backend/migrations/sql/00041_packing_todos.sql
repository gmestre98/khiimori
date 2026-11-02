-- +goose Up
-- Trip to-dos — the "To-dos" half of a trip's Prep tab (the other half is the
-- packing list in packing.items). One row per thing to get done before or
-- during a trip: "Apply online for the Mauritanian visa", "Book a bed in
-- Bakau". Lives in the packing schema because it shares the Prep tab's module,
-- authorizer and grants (00038 set DEFAULT PRIVILEGES for app_rw on this
-- schema, so this table is covered automatically).
--
-- No cross-schema FKs per migrations/README: trip_id references trip.trips by id
-- only; every read is scoped by trip_id, so rows of a deleted trip are
-- unreachable.
--
-- due_date is optional (a to-do with no deadline). note is a short free-text
-- qualifier. done is the check-off state. position keeps a stable order among
-- to-dos that share a due date.
CREATE TABLE packing.todos (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    uuid        NOT NULL,                       -- application-level ref to trip.trips
    title      text        NOT NULL,
    note       text        NOT NULL DEFAULT '',
    due_date   date,
    done       boolean     NOT NULL DEFAULT false,
    position   integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The list read is always "all to-dos for a trip, ordered"; index the trip_id.
CREATE INDEX packing_todos_trip_id_idx ON packing.todos (trip_id);

-- +goose Down
DROP TABLE packing.todos;
