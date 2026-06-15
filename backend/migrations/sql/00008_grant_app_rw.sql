-- +goose Up
-- Grant the least-privilege application role (app_rw) read/write on the module
-- schemas' tables, and — crucially — set DEFAULT PRIVILEGES so tables created by
-- *future* migrations are covered automatically.
--
-- Why this is needed: the M01.3 role setup ran `GRANT ... ON ALL TABLES IN
-- SCHEMA …` while the schemas were still empty, and omitted ALTER DEFAULT
-- PRIVILEGES. `ON ALL TABLES` is point-in-time, so the first runtime table —
-- auth.users (M02.2) — was created later with no grant to app_rw, and the
-- deployed app (whose DATABASE_URL uses app_rw) hit "permission denied for table
-- users" on first sign-in. This grants the existing tables and makes future ones
-- automatic so it can't recur for trip/budget/… tables.
--
-- Guarded on app_rw existing: local dev (neondb_owner) and the ephemeral test DB
-- (postgres) have no such role, so this is a no-op there; only the deployed Neon
-- database is affected. It runs as the migration owner (DATABASE_URL_DIRECT),
-- which owns the schemas/tables and can both grant and set defaults for its own
-- future objects.

-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    GRANT USAGE ON SCHEMA auth, trip, budget, journal, sharing, geo TO app_rw;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, trip, budget, journal, sharing, geo TO app_rw;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, trip, budget, journal, sharing, geo TO app_rw;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth, trip, budget, journal, sharing, geo
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth, trip, budget, journal, sharing, geo
      GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
  END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth, trip, budget, journal, sharing, geo
      REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_rw;
    ALTER DEFAULT PRIVILEGES IN SCHEMA auth, trip, budget, journal, sharing, geo
      REVOKE USAGE, SELECT ON SEQUENCES FROM app_rw;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth, trip, budget, journal, sharing, geo FROM app_rw;
    REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth, trip, budget, journal, sharing, geo FROM app_rw;
    REVOKE USAGE ON SCHEMA auth, trip, budget, journal, sharing, geo FROM app_rw;
  END IF;
END $$;
-- +goose StatementEnd
