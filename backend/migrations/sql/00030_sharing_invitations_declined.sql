-- +goose Up
-- Add 'declined' to the invitation status lifecycle so a recipient can decline
-- an invitation addressed to them. A declined invitation is terminal like
-- 'revoked': it can no longer be claimed, and it drops out of both the
-- recipient's in-app inbox (status='sent' only) and the owner's pending-invites
-- list (status='sent' only), so declining removes the invite for the recipient
-- and stops it showing on the owner's sharing page.
--
-- 'revoked' is the owner cancelling a pending invite; 'declined' is the
-- recipient turning it down. They are kept distinct so the lifecycle records who
-- ended the invitation.
ALTER TABLE sharing.invitations
    DROP CONSTRAINT invitations_status_check;

ALTER TABLE sharing.invitations
    ADD CONSTRAINT invitations_status_check
        CHECK (status IN ('sent', 'accepted', 'revoked', 'declined'));

-- +goose Down
-- Revert: rows with 'declined' must not exist when rolling back.
ALTER TABLE sharing.invitations
    DROP CONSTRAINT invitations_status_check;

ALTER TABLE sharing.invitations
    ADD CONSTRAINT invitations_status_check
        CHECK (status IN ('sent', 'accepted', 'revoked'));
