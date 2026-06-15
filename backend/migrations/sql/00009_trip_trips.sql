-- +goose Up
-- The Trip entity (PRD §9, §5.1), owned by the trip module's schema. A trip is
-- the structural backbone every later milestone hangs off (days, planning,
-- budgets, journal, maps), so the table is created here in Epic M03.1 and
-- extended (days, etc.) by later epics.
--
-- owner_id references the auth.users row of the creator, but there is NO
-- cross-schema foreign key (migrations/README.md): a FK from trip.* into auth.*
-- would couple the modules and break the "peel a module into its own service"
-- property. Integrity across modules is enforced in application code; the column
-- is a plain uuid carrying the owner's id. An index supports owner-scoped reads
-- (every trip read/write is scoped to the owner — Epic 04).
--
-- destinations is modelled as a text[] (not JSONB): the value is a flat,
-- ordered list of place names with no nested structure, so a Postgres array is
-- the simplest faithful representation and keeps queries/ordering trivial. JSONB
-- would add structure we do not need here.
--
-- base_currency is fixed to EUR for v1 (PRD §5.1): the column defaults to EUR
-- and a CHECK pins it, so the fixity is enforced at the database level too — no
-- request, however crafted, can store another currency. status carries the
-- active/archived lifecycle (Epic S4) and defaults to active; a CHECK constrains
-- it to the known values. end_date >= start_date is enforced as a CHECK so an
-- invalid range can never be persisted even if the API validation were bypassed.
CREATE TABLE trip.trips (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The creator's auth.users id. No cross-schema FK (see above); never null.
    owner_id      uuid        NOT NULL,
    name          text        NOT NULL,
    -- Ordered list of destination names; empty array when none given yet.
    destinations  text[]      NOT NULL DEFAULT '{}',
    start_date    date        NOT NULL,
    end_date      date        NOT NULL,
    -- Fixed to EUR for v1 (PRD §5.1); set server-side, pinned by the CHECK below.
    base_currency text        NOT NULL DEFAULT 'EUR',
    -- Cloud Storage object reference or external URL (M01.4); empty when unset.
    cover         text        NOT NULL DEFAULT '',
    -- active | archived. Archive (S4) hides without deleting; default active.
    status        text        NOT NULL DEFAULT 'active',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trips_status_check   CHECK (status IN ('active', 'archived')),
    CONSTRAINT trips_currency_eur   CHECK (base_currency = 'EUR'),
    CONSTRAINT trips_dates_ordered  CHECK (end_date >= start_date)
);

-- Owner-scoped reads (listing, authorization) filter on owner_id.
CREATE INDEX trips_owner_id_idx ON trip.trips (owner_id);

-- +goose Down
DROP TABLE trip.trips;
