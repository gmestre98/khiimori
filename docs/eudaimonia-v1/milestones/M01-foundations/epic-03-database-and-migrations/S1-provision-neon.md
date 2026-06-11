# S1 — Provision Neon Postgres database

## Context
Eudaimonia stores all data in a single **Postgres** database on **Neon** (PRD §7.7, §7.8). Neon is the
one component that doesn't scale to zero for free indefinitely, so v1 starts on the **free tier ≈€0**
(PRD §8.4 #1, §8.6). This story stands up the project/database and captures the connection details so the
rest of the epic (driver, migrations, readiness) has something real to talk to. The connection string is a
**secret** and must never be committed — it will live in Secret Manager (M01.4); here we just document the
handoff.

Author-provided: a Neon account.

## Task
Provision one Neon project + Postgres database (free tier) and document how to obtain its connection strings.

## Acceptance criteria
- [ ] A single Neon project + database exists on the **free tier**, in a region close to the GCP region used by M01.4.
- [ ] Both the **pooled** (pgBouncer) and **direct** connection strings are identified and documented
  (the driver story S2 needs both).
- [ ] A dedicated application role/user is used (not the Neon admin/owner) for the service connection.
- [ ] Connection secrets are recorded in a way that is **not committed to git** (e.g. a local `.env`
  ignored by git + a note that M01.4 moves them to Secret Manager).
- [ ] `docs/` (or the epic) notes the project/branch names and how to regenerate the password.

## Constraints
- Free tier only — no paid commitment in this epic (PRD §8.6).
- Never commit a connection string or password; treat them as secrets from minute one (PRD §6, §8.5).

## Definition of done
A reviewer can reach the database with the documented pooled connection string from a `psql`/driver test
and the credentials are nowhere in the repo.

## Dependencies
M01.1 (repo). Author-provided Neon account. Upstream of every other story in this epic.
