# Database migrations

Schema changes are versioned, plain-SQL [goose](https://github.com/pressly/goose)
migrations, embedded into the binary (`embed.go`) and applied by
[`cmd/migrate`](../cmd/migrate). This directory (Epic M01.3 / S3) establishes the
mechanism; the per-module schemas land in S4 and the ergonomic runner commands in
S5.

## Tooling

- **Tool:** goose v3, used as a **Go library** (not its CLI). Rationale: the
  library lets us bring our own pgx connection and embed migrations, so we avoid
  pulling goose's CLI driver set (MySQL, SQLite, …) into the module — only
  Postgres via `pgx/v5/stdlib`. Plain SQL, no ORM/DSL (PRD §7.0).
- **Version:** pinned in [`go.mod`](../go.mod) (`github.com/pressly/goose/v3`).
- **Driver / connection:** migrations run against the **direct** Neon endpoint
  (`DATABASE_URL_DIRECT`) — schema changes must bypass the pgBouncer pooler.

## Layout & naming

```
migrations/
  embed.go          # embeds sql/ as an fs.FS for goose
  sql/
    00001_auth_init.sql      # creates schema auth
    00002_trip_init.sql      # creates schema trip
    00003_budget_init.sql    # creates schema budget
    00004_journal_init.sql   # creates schema journal
    00005_sharing_init.sql   # creates schema sharing
    00006_geo_init.sql       # creates schema geo
    NNNNN_<module>_<description>.sql   # future per-module migrations
```

## Schema-per-module

Each domain module owns its own Postgres **schema** so a module can later move to
its own service/DB without a data redesign (PRD §7.7, §7.0). The first six
migrations create the (empty) schemas — one per module: `auth`, `trip`,
`budget`, `journal`, `sharing`, `geo`. Each is owned by the connecting
application role (`CREATE SCHEMA` defaults ownership to the current role).

Each module's future tables and migrations live **under its own schema** and
carry its `<module>` filename prefix, e.g. auth's history is `00001_auth_init`,
then `0000N_auth_users`, … Qualify every object with its schema (`trip.trips`,
not `trips`).

**No cross-schema foreign keys.** A FK from one module's schema into another's
would couple them and break the "peel a module into its own service" property.
Modules reference each other by id only; integrity across modules is enforced in
application code, not the database. (This mirrors the backend's module-boundary
rule.)

- Files live in `sql/` and are named `NNNNN_<module>_<description>.sql`, e.g.
  `00001_auth_init.sql`, `00002_trip_add_trips_table.sql`.
- `NNNNN` is a zero-padded, strictly increasing sequence (goose applies in this
  order and records it in a `goose_db_version` table).
- The `<module>` prefix groups each migration with its owning domain module
  (`auth`, `trip`, `budget`, `journal`, `sharing`, `geo`) — a single ordered
  history, grouped by filename rather than per-module subdirectories so there is
  one goose sequence and one version table.

## Authoring a migration

Each file has a `goose Up` and a `goose Down` section so every change is
reversible:

```sql
-- +goose Up
CREATE TABLE trip.trips (...);

-- +goose Down
DROP TABLE trip.trips;
```

Conventions:

- One logical change per file; always provide a working `Down`.
- Qualify objects with their module schema (`trip.trips`, not `trips`) and follow
  the schema-per-module rules above (own schema, no cross-schema FKs).

## Running

The one command for migrations everywhere — local dev, CI, deploy — is the
`make migrate-*` target (run from the repo root):

```sh
make migrate-up        # apply all pending migrations
make migrate-down      # roll back the most recent migration
make migrate-reset     # roll back all migrations
make migrate-status    # show applied / pending
```

The target loads `backend/.env` when present (local dev) and otherwise uses the
ambient environment, so it migrates **whatever `DATABASE_URL_DIRECT` points at**
(dev, an ephemeral test branch, prod) with no code change. See
[`../docs/database.md`](../docs/database.md) for the connection strings.

Under the hood each target runs `go run ./cmd/migrate <command>` (the same
binary CI and the S7 integration test use). Any failure exits non-zero with a
message on stderr — no secrets in the output — so CI can gate on it. You can call
it directly too, with `DATABASE_URL_DIRECT` set:

```sh
cd backend && go run ./cmd/migrate up
```

## Integration test

`integration_test.go` (build tag `integration`) runs the full migration set
against a real database and asserts the six module schemas appear and roll back
cleanly. It is excluded from the default `go test ./...` so unit runs stay fast
and DB-free.

It targets a **dedicated** `DATABASE_URL_TEST` — a throwaway database, ideally an
ephemeral Neon branch — and resets it; it intentionally does **not** fall back to
`DATABASE_URL_DIRECT`, so a real dev/prod DSN is never wiped by accident. If
`DATABASE_URL_TEST` is unset the test skips.

```sh
# point at a throwaway DB / ephemeral branch, then:
DATABASE_URL_TEST="postgres://…/eud_test?sslmode=require" make test-integration
# or directly:
cd backend && DATABASE_URL_TEST="…" go test -tags=integration ./migrations/...
```

M01.5 runs this in CI against an ephemeral Neon branch.

Other packages carry their own `integration`-tagged suites against the same
disposable DB — e.g. `internal/auth` exercises user provisioning end-to-end
(M02.2 S5). CI runs them together, serialised so they don't share the database
concurrently:

```sh
cd backend && DATABASE_URL_TEST="…" \
    go test -tags=integration -p 1 ./migrations/... ./internal/auth/...
```
