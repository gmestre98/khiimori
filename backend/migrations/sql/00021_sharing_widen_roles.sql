-- +goose Up
-- Widen the role CHECK on sharing.trip_memberships to include 'editor' and
-- 'viewer'. The membership lifecycle (add / change role / revoke) and the
-- authorization service land in Milestone 08; the table was introduced in M03
-- with only 'owner' to keep that migration minimal.
ALTER TABLE sharing.trip_memberships
    DROP CONSTRAINT trip_memberships_role_check;

ALTER TABLE sharing.trip_memberships
    ADD CONSTRAINT trip_memberships_role_check
        CHECK (role IN ('owner', 'editor', 'viewer'));

-- +goose Down
-- Revert: rows with 'editor'/'viewer' must not exist when rolling back.
ALTER TABLE sharing.trip_memberships
    DROP CONSTRAINT trip_memberships_role_check;

ALTER TABLE sharing.trip_memberships
    ADD CONSTRAINT trip_memberships_role_check
        CHECK (role IN ('owner'));
