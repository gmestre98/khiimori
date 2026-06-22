-- +goose Up
-- TripMembership (PRD §9, §5.1), owned by the sharing module's schema. The full
-- membership lifecycle (invitations, roles beyond owner, reads) is Milestone 08;
-- the table is introduced here (M03.1 S2) so the trip creator's **Owner** row can
-- be written transactionally with the trip, and M08 extends this table rather than
-- migrating it (PRD §7.0).
--
-- trip_id and user_id reference trip.trips and auth.users respectively, but there
-- are NO cross-schema foreign keys (migrations/README.md): a FK from sharing.*
-- into trip.*/auth.* would couple the modules and break the "peel a module into
-- its own service" property. Integrity across modules is enforced in application
-- code; the columns are plain uuids carrying the referenced rows' ids.
--
-- role is constrained to the roles known today — only 'owner' in v1. Milestone 08
-- relaxes this CHECK to add editor/viewer. A (trip_id, user_id) uniqueness
-- constraint makes a user's membership in a trip single-valued, so the owner row
-- can't be duplicated. Deleting a trip cascades its memberships via an explicit
-- transactional delete in the trip module (S4) — there is no DB cascade, since
-- that would require a cross-schema FK.
CREATE TABLE sharing.trip_memberships (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- trip.trips.id of the trip this membership grants access to. No cross-schema
    -- FK (see above); never null.
    trip_id    uuid        NOT NULL,
    -- auth.users.id of the member. No cross-schema FK (see above); never null.
    user_id    uuid        NOT NULL,
    -- Membership role. 'owner' only in v1; M08 widens the CHECK.
    role       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT trip_memberships_role_check CHECK (role IN ('owner')),
    CONSTRAINT trip_memberships_unique     UNIQUE (trip_id, user_id)
);

-- Lookups by trip (cascade delete, M08 member lists) and by user (a user's trips).
CREATE INDEX trip_memberships_trip_id_idx ON sharing.trip_memberships (trip_id);
CREATE INDEX trip_memberships_user_id_idx ON sharing.trip_memberships (user_id);

-- +goose Down
DROP TABLE sharing.trip_memberships;
