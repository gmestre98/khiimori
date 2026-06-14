-- +goose Up
-- The User entity (PRD §9), owned by the auth module's schema. Keyed by
-- google_sub (the stable Google account id) so provisioning is idempotent on it
-- (M02.2): a returning sign-in resolves to the same row and a changed Google
-- email updates rather than duplicates. The profile fields live on this single
-- row — the row IS the user's (initially empty) editable profile, so a user can
-- never exist without one.
CREATE TABLE auth.users (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Unique idempotency key for provisioning; never null. Identity fields below
    -- (email/name/avatar) are refreshed from Google on each sign-in; google_sub
    -- is the one stable key and must not change.
    google_sub       text        NOT NULL UNIQUE,
    email            text        NOT NULL DEFAULT '',
    name             text        NOT NULL DEFAULT '',
    avatar           text        NOT NULL DEFAULT '',
    -- User-editable profile fields (Epic 04). Empty on provisioning and never
    -- overwritten by an identity refresh.
    home_base        text        NOT NULL DEFAULT '',
    -- Fixed to EUR for v1 (PRD §5.8); set server-side, read-only in the profile.
    default_currency text        NOT NULL DEFAULT 'EUR',
    -- Flexible-within-Postgres bag for theme preference and future toggles
    -- (PRD §9), keeping the column count small.
    prefs            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    -- Admin flag consumed by Milestone 08's backoffice. Defaults false for
    -- everyone; only the non-public bootstrap path (M02.2 S4) sets it true.
    is_admin         boolean     NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE auth.users;
