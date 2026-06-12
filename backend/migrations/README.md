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
    .gitkeep        # keeps the dir present while empty (S3)
    NNNNN_<module>_<description>.sql
```

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

Conventions (enforced by convention, expanded in S4):

- One logical change per file; always provide a working `Down`.
- Qualify objects with their module schema (`trip.trips`, not `trips`).
- No cross-schema foreign keys (keeps modules peelable) — see S4.

## Running

Set `DATABASE_URL_DIRECT` (see [`../docs/database.md`](../docs/database.md)) and
run from the `backend/` directory:

```sh
go run ./cmd/migrate up       # apply all pending migrations
go run ./cmd/migrate down     # roll back the most recent migration
go run ./cmd/migrate status   # show applied / pending
```

Any failure exits non-zero with a message on stderr. S5 wraps these in
`make migrate-*` targets.
