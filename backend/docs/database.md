# Database (Neon Postgres)

Eudaimonia stores all data in a single Postgres database on [Neon](https://neon.tech).
This document covers **provisioning and connecting** (Epic M01.3 / S1). The
connection layer, migrations, and readiness check are documented as their stories
land (S2–S8 expand this file).

## What is provisioned

| | |
|---|---|
| Provider | Neon (serverless Postgres) |
| Tier | **Free** (≈€0) — the one component that doesn't scale to zero for free forever (PRD §8.4 #1) |
| Region | `eu-west-2` (AWS, London) — close to the GCP region M01.4 deploys to |
| Database | `neondb` |
| Branch | `main` (Neon's default branch) |
| Postgres | 18 |

The **scale-up lever** (free → paid, ~€10–18/mo for always-on reliability mid-trip)
is a dashboard toggle in Neon, not a code change (PRD §8.6). See M01.8 for cost
guardrails.

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
pooling.

Both strings are otherwise identical: same user, password, database, and
`sslmode=require` (Neon requires TLS).

## Roles

The service currently connects as `neondb_owner` (Neon's default owner role).

> **Follow-up (not blocking v1):** S1's acceptance criteria prefer a *dedicated,
> least-privilege application role* rather than the owner. To create one in the
> Neon SQL editor:
>
> ```sql
> CREATE ROLE app_rw LOGIN PASSWORD '<generated>';
> GRANT USAGE ON SCHEMA auth, trip, budget, journal, sharing, geo TO app_rw;
> GRANT ALL ON ALL TABLES    IN SCHEMA auth, trip, budget, journal, sharing, geo TO app_rw;
> GRANT ALL ON ALL SEQUENCES IN SCHEMA auth, trip, budget, journal, sharing, geo TO app_rw;
> ```
>
> Then swap the user in `DATABASE_URL` / `DATABASE_URL_DIRECT`. (Schemas are
> created in S4.)

## Where the connection strings live

Connection strings are **secrets** and are never committed:

- **Local dev:** `backend/.env` (gitignored). Copy the template and fill it in:
  ```sh
  cd backend && cp .env.example .env   # then paste your Neon strings
  ```
- **CI:** GitHub Actions repository secrets `DATABASE_URL` (pooled) and
  `DATABASE_URL_DIRECT` (direct).
- **Deployment:** GCP **Secret Manager** (wired in M01.4). The app reads them
  from the environment regardless of source.

`.gitignore` ignores `.env`/`.env.*` and re-includes only `.env.example`.

## Regenerating the password

In the Neon console: **Project → Roles → `neondb_owner` → Reset password**, then
update the password in `backend/.env`, the GitHub secrets, and (once M01.4 lands)
Secret Manager. A reset invalidates the old password immediately.

## Quick connectivity check

```sh
# Pooled endpoint (what the app uses):
psql "$DATABASE_URL" -tAc "select current_user, version();"

# Direct endpoint (what migrations use):
psql "$DATABASE_URL_DIRECT" -tAc "select current_user;"
```

Both should return a row. If they hang, the Neon instance may be cold-starting —
retry once.
