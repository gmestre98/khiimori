-- +goose Up
-- Create the packing module's schema. Owned by the connecting role (the
-- application role); see ../README.md for the schema-per-module rationale.
--
-- Unlike the original six schemas (00001–00006), whose app_rw grants were added
-- retroactively in 00008, this schema post-dates 00008 — whose GRANT/ALTER
-- DEFAULT PRIVILEGES statements name a fixed list of schemas that does NOT
-- include packing. So this migration grants app_rw on the new schema itself and
-- sets DEFAULT PRIVILEGES so the packing tables created by the *following*
-- migrations are covered automatically. Guarded on app_rw existing: local dev
-- (neondb_owner) and the ephemeral test DB (postgres) have no such role, so the
-- grant block is a no-op there; only the deployed Neon database is affected.
CREATE SCHEMA IF NOT EXISTS packing;

-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT USAGE ON SCHEMA packing TO app_rw;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA packing TO app_rw;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA packing TO app_rw;
    ALTER DEFAULT PRIVILEGES IN SCHEMA packing
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
    ALTER DEFAULT PRIVILEGES IN SCHEMA packing
      GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
  END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA packing
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_rw;
    ALTER DEFAULT PRIVILEGES IN SCHEMA packing
      REVOKE USAGE, SELECT ON SEQUENCES FROM app_rw;
    REVOKE USAGE ON SCHEMA packing FROM app_rw;
  END IF;
END $$;
-- +goose StatementEnd

-- RESTRICT (the default): fails loudly if the schema still holds objects, which
-- would mean a later module migration didn't roll back first.
DROP SCHEMA IF EXISTS packing;
