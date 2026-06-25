-- +goose Up
-- Invitation table for the email-invitation lifecycle (M08.3 S1, PRD §9, §11.1).
-- Lives in sharing.* alongside trip_memberships.
--
-- role is constrained to Editor | Viewer only — Owners can only be created
-- implicitly via trip creation, never via invitation (PRD §11.1).
--
-- token is a URL-safe unguessable capability token (generated as a random UUID
-- at the application layer) that authorises the accept action. It is UNIQUE so
-- the accept path can look it up without additional filtering.
--
-- status tracks the invitation lifecycle: 'sent' → 'accepted' | 'revoked'.
-- A revoked pending invitation can no longer be claimed. An accepted invitation
-- cannot be revoked (the membership must be revoked instead).
--
-- trip_id references trip.trips.id but there is NO cross-schema FK (same rule as
-- trip_memberships): integrity across module boundaries is enforced in
-- application code.
CREATE TABLE sharing.invitations (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id    uuid        NOT NULL,
    email      text        NOT NULL,
    role       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'sent',
    token      text        NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invitations_role_check   CHECK (role IN ('editor', 'viewer')),
    CONSTRAINT invitations_status_check CHECK (status IN ('sent', 'accepted', 'revoked'))
);

-- Fast lookup by token (accept flow).
CREATE INDEX invitations_token_idx    ON sharing.invitations (token);
-- Fast lookup by trip (owner listing pending invitations).
CREATE INDEX invitations_trip_id_idx  ON sharing.invitations (trip_id);
-- Fast lookup by email (claim on sign-in: find pending invitations for a user).
CREATE INDEX invitations_email_idx    ON sharing.invitations (email);

-- +goose Down
DROP TABLE sharing.invitations;
