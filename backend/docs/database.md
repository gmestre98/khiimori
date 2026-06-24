# Database (Neon Postgres)

Khiimori stores all data in a single Postgres database on [Neon](https://neon.tech).
This is the operational guide: how to connect, run migrations, and where the
secrets live. Migration authoring detail lives in
[`../migrations/README.md`](../migrations/README.md); this page is the hub.

## What is provisioned

| | |
|---|---|
| Provider | Neon (serverless Postgres) |
| Tier | **Free** (≈€0) — the one component that doesn't scale to zero for free forever (PRD §8.4 #1) |
| Region | `eu-west-2` (AWS, London) — close to the GCP region M01.4 deploys to |
| Database | `neondb` |
| Branches | `production` (default — app + deploy target) and `dev` (local schema iteration; see [Dev branch & the destructive-migration guard](#dev-branch--the-destructive-migration-guard)) |
| Postgres | 18 |

## Pooled vs direct endpoints

Neon exposes the same database on two endpoints that differ only by a `-pooler`
segment in the host:

| Endpoint | Host shape | Used by |
|----------|------------|---------|
| **Pooled** (pgBouncer) | `ep-<id>-pooler.<region>.aws.neon.tech` | app traffic, `/readyz` |
| **Direct** | `ep-<id>.<region>.aws.neon.tech` | migrations, admin tasks |

App traffic goes through the **pooler** so that scale-to-zero ↔ always-on is a
config change, not a code change (PRD §8.6). Migrations use the **direct**
endpoint because schema changes shouldn't go through pgBouncer's transaction
pooling. Both strings are otherwise identical (same user, password, database,
`sslmode=require`).

## How the app connects

The service opens a pooled connection at startup (`internal/platform/db`, built
on `pgx`/`pgxpool`) and closes it on shutdown. Configuration is by environment
variable — see the template [`../.env.example`](../.env.example):

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | pooled DSN — required when `DB_POOLED=true` (the default) |
| `DATABASE_URL_DIRECT` | direct DSN — required when `DB_POOLED=false`; used by migrations |
| `DB_POOLED` | `true` → use the pooled endpoint, `false` → direct. A config change, not a code change (PRD §8.6) |

The database is a **hard dependency**: config requires the active DSN, and the
service pings the DB eagerly at startup and **refuses to boot** if it's missing
or unreachable — failing fast rather than at request time. Once running,
[`GET /readyz`](../internal/platform/health) reflects live connectivity (a `db`
check pinging through the pooler); `GET /healthz` stays dependency-free.

## Migrations

Schema changes are versioned, plain-SQL [goose](https://github.com/pressly/goose)
migrations under [`../migrations`](../migrations), embedded into the binary and
run against the **direct** endpoint. Each domain module owns its own **schema**
(`auth`, `trip`, `budget`, `journal`, `sharing`, `geo`) so a module can later
move to its own service/DB without a data redesign (PRD §7.7) — no cross-schema
foreign keys.

One command, everywhere (local, CI, deploy):

```sh
make migrate-up        # apply all pending migrations
make migrate-down      # roll back the most recent migration
make migrate-reset     # roll back all migrations
make migrate-status    # show applied / pending
```

These load `backend/.env` when present and otherwise use the ambient
environment, so they migrate whatever `DATABASE_URL_DIRECT` points at. To author
a migration, see [`../migrations/README.md`](../migrations/README.md).

> **`down` and `reset` are destructive.** Their goose `Down` sections `DROP`
> tables and schemas, so they erase data. They are **blocked against the
> production endpoint** — see the next section. Run them against the `dev`
> branch instead.

## Dev branch & the destructive-migration guard

There is one Neon project with two branches. `production` is what the app and the
deploy pipeline use; **`dev`** is a copy-on-write branch (parent: `production`)
for local schema work. Because a branch is an independent endpoint, running
`migrate reset`/`down` against `dev` can never touch production data.

**Local dev points at `dev`.** In the Neon console open the `dev` branch, copy
its pooled + direct connection strings (the endpoint id differs from
production's), and put them in `backend/.env` as `DATABASE_URL` /
`DATABASE_URL_DIRECT`. Production credentials live only in GitHub secrets and GCP
Secret Manager — not in anyone's `.env`.

**The guard.** `migrate down` and `migrate reset` refuse to run when
`DATABASE_URL_DIRECT` resolves to a *protected* host — by default the production
endpoint `ep-shiny-glade-ab3ps862` (a bare host fragment, not a secret).
`migrate up` is additive and never guarded, so deploys are unaffected. The check
lives in [`config.IsProtectedMigrationTarget`](../internal/platform/config/config.go)
and is enforced in [`cmd/migrate`](../cmd/migrate/main.go).

| Variable | Effect |
|----------|--------|
| `MIGRATE_PROTECTED_HOSTS` | Comma-separated host fragments to protect. Overrides the default (e.g. protect a staging branch too). |
| `MIGRATE_FORCE=true` | Escape hatch for a *deliberate* production rollback. Prints a loud warning, then proceeds. |

```sh
# Against production this now refuses instead of wiping data:
$ make migrate-reset
migrate: refusing to run "reset" against protected host
  "ep-shiny-glade-ab3ps862.eu-west-2.aws.neon.tech": this would roll back
  migrations and DROP tables, destroying data. Use a Neon dev branch for schema
  iteration, or set MIGRATE_FORCE=true to override
```

## Where the connection strings live

Connection strings are **secrets** and are never committed:

- **Local dev:** `backend/.env` (gitignored). Copy the template and fill it in:
  ```sh
  cd backend && cp .env.example .env   # then paste your Neon strings
  ```
- **CI:** GitHub Actions repository secrets `DATABASE_URL` (pooled) and
  `DATABASE_URL_DIRECT` (direct).
- **Deployment:** GCP **Secret Manager** (wired in M01.4) is the source of truth;
  the app reads the values from the environment regardless of source.

`.gitignore` ignores `.env`/`.env.*` and re-includes only `.env.example`. Never
paste a real connection string into a tracked file.

## Local test DB / ephemeral branch

The migration integration test (build tag `integration`) applies the full
migration set to a throwaway database and asserts the six module schemas appear
and roll back cleanly:

```sh
# DATABASE_URL_TEST must point at a disposable DB — ideally an ephemeral Neon
# branch — never a real dev/prod DSN (the test resets it).
DATABASE_URL_TEST="postgres://…/eud_test?sslmode=require" make test-integration
```

It **skips** when `DATABASE_URL_TEST` is unset. To make a throwaway database
quickly you can `CREATE DATABASE eud_test;` on the dev branch (then
`DROP DATABASE eud_test WITH (FORCE);`), or create an ephemeral branch in the
Neon console. M01.5 runs this in CI against an ephemeral branch.

## Roles

Local dev may still connect as `neondb_owner` (Neon's default owner role) for
convenience. **Deployment is least-privilege:** the `DATABASE_URL` value stored
in GCP Secret Manager (provisioned in M01.4 — see
[`infra/secrets.ts`](../../infra/secrets.ts)) uses a dedicated **`app_rw`** role,
**not** the owner. Create it once in the Neon SQL editor, then use *its*
credential as the secret value:

```sql
CREATE ROLE app_rw LOGIN PASSWORD '<generated>';
GRANT USAGE ON SCHEMA auth, trip, budget, journal, sharing, geo TO app_rw;
```

The per-table privileges and — importantly — the **default privileges for future
tables** are applied by a **migration** (`00008_grant_app_rw.sql`), not by hand,
so they stay reproducible and are re-applied on every deploy:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA … TO app_rw;
GRANT USAGE, SELECT             ON ALL SEQUENCES IN SCHEMA … TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA … GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA … GRANT USAGE, SELECT             ON SEQUENCES TO app_rw;
```

The `ALTER DEFAULT PRIVILEGES` is the key bit: a bare `GRANT … ON ALL TABLES` is
point-in-time, so a table created by a *later* migration would otherwise be
inaccessible to `app_rw` (this is exactly what caused the M02 sign-in
`permission denied for table users`). The migration is guarded on the role
existing, so it is a no-op for local/test databases that connect as the owner.

`app_rw` is intentionally **not** an owner: it can read/write data in the module
schemas but cannot create/drop schemas or alter privileges. Schema changes
(migrations) keep using the owner via `DATABASE_URL_DIRECT`, which is also the
role that runs `00008` and thus owns the default-privilege defaults.

## Regenerating the password

In the Neon console: **Project → Roles → `neondb_owner` → Reset password**, then
update the password in `backend/.env`, the GitHub secrets, and (once M01.4 lands)
Secret Manager. A reset invalidates the old password immediately.

## Scale-up lever

The database is the one component that doesn't scale to zero for free forever.
v1 runs on the **free tier (≈€0)**; if mid-trip reliability needs always-on, the
documented lever is **Neon free → paid tier** (~€10–18/mo) — a dashboard/config
toggle in the Neon console, **not** a code change or rewrite (PRD §8.6). Because
app traffic already goes through the pooler, flipping scale-to-zero ↔ always-on
needs no code. See the cost guardrails in
[M01.8](../../docs/khiimori-v1/milestones/M01-foundations/epic-08-cost-guardrails/README.md).

## Quick connectivity check

```sh
psql "$DATABASE_URL"        -tAc "select current_user, version();"  # pooled (app)
psql "$DATABASE_URL_DIRECT" -tAc "select current_user;"             # direct (migrations)
```

Both should return a row. If they hang, the Neon instance may be cold-starting —
retry once.
