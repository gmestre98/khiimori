-- +goose Up
-- Add active flag to auth.users for user deactivation (M08.5). Defaults true
-- so all existing users are active; a backoffice admin sets it false to
-- permanently block a user from authenticating (M08.5 S3).
ALTER TABLE auth.users
    ADD COLUMN active boolean NOT NULL DEFAULT true;

-- +goose Down
ALTER TABLE auth.users DROP COLUMN active;
