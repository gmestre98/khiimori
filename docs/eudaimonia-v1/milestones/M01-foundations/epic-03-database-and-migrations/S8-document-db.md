# S8 — Document the database story

## Context
The database has moving parts a future contributor (the author, mid-trip) must understand quickly: how to
get a connection, pooled-vs-direct, how to run/author migrations, and how secrets flow to Secret Manager
(M01.4). This story writes that down so the DB layer is operable without spelunking the code.

Assumes the connection layer (**S2**), migrations (**S3–S5**), and readiness check (**S6**) exist.

## Task
Write concise documentation for connecting to, migrating, and operating the database.

## Acceptance criteria
- [ ] Documents the **pooled vs direct** connection strings and when each is used (app traffic vs migrations) (PRD §8.6).
- [ ] Explains how to author and run migrations (the S5 commands) and the **schema-per-module** convention.
- [ ] States that connection secrets live only in **Secret Manager** (M01.4) and are never committed (PRD §6, §8.5).
- [ ] Includes a short "local test DB / ephemeral branch" how-to pointing at the S7 integration test.
- [ ] Notes the **scale-up lever**: "Neon free → paid tier" is a dashboard/config change, not a rewrite (PRD §8.6) —
  cross-links to M01.8's cost guardrails.

## Constraints
- Docs only — keep it short and operational, not a tutorial.
- Don't paste real connection strings or secrets anywhere.

## Definition of done
A new contributor can, from the doc alone, connect to the DB, run migrations, and know where secrets live.

## Dependencies
S2–S7. Cross-links to M01.4 (secrets) and M01.8 (scale-up levers).
