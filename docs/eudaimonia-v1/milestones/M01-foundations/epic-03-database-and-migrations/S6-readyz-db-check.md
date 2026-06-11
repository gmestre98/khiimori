# S6 — Wire DB connectivity into `/readyz`

## Context
`/readyz` was built in M01.2 (S8) around a **pluggable check registry** with a documented seam for exactly
this: the database readiness check (PRD §7.1, epic AC4). Now that a pooled connection exists (**S2**), this
story registers a DB check so readiness reflects real connectivity — without changing the `/readyz` contract.

Assumes the readiness registry from M01.2 S8 and the DB connection layer from **S2** exist.

## Task
Register a database readiness check that verifies connectivity through the **pooled** connection and attach it
to `/readyz`.

## Acceptance criteria
- [ ] A `ReadinessCheck` is registered that pings the DB through the **pooler** (the path real traffic uses) (PRD §8.6).
- [ ] `GET /readyz` returns `503` (naming the failing `db` check) when the DB is unreachable and `200` when it's healthy.
- [ ] `/healthz` is **unaffected** — liveness still does no DB I/O (M01.2 S7).
- [ ] The check honours the registry's bounded timeout so a slow/cold Neon instance can't hang the probe.
- [ ] A unit test with a fake/failing DB pinger asserts the 200/503 behaviour (no live DB required).

## Constraints
- Reuse the existing registry/contract from M01.2 S8 — do **not** change its shape.
- Ping through the pooled connection, not a fresh direct connection.

## Definition of done
With the DB up, `/readyz` is 200 and lists a passing `db` check; with it down, `/readyz` is 503; unit test green.

## Dependencies
M01.2 S8 (readiness registry), S2 (DB connection). Satisfies epic AC4.
