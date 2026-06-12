# S2 — DB connection layer (serverless driver / pooler)

> **Status:** ✅ Done.

## Context
The service must connect to Neon through its **serverless driver / connection pooler** so that flipping
between scale-to-zero and always-on is a **config change, not a code change** (PRD §8.6). This story adds the
database access layer to the `platform` package: open a pooled connection from config, expose a handle the
modules will later use, and close it on shutdown. Pooled (pgBouncer) is the default; a direct connection is
selectable by config for migrations/admin tasks.

Assumes the platform config loader (M01.2 S1) exists and Neon is provisioned (**S1**).

## Task
Add `internal/platform/db` that opens a pooled Postgres connection from config and manages its lifecycle.

## Acceptance criteria
- [x] A constructor builds a connection pool from a config-supplied connection string (read from env/Secret
  Manager, never hardcoded).
- [x] **Pooled vs direct** is a config toggle (e.g. `DB_POOLED=true`) — switching does not require code edits (PRD §8.6).
- [x] Sensible pool limits and connect/statement timeouts are set (suited to Neon scale-to-zero cold starts).
- [x] A `Ping`/health method exists for the readiness check (S6) to call.
- [x] The pool is closed cleanly on service shutdown (integrates with M01.2's graceful shutdown).
- [x] A unit test covers config→DSN construction and the pooled/direct toggle (no live DB needed).

## Constraints
- Use Neon's recommended pooler/serverless path; keep the driver behind a thin interface so it can be
  swapped (PRD §7.0). The Postgres driver is a necessary third-party dependency — **confirm the specific
  library with the author and record it here before adding it** (project rule: stdlib-first, ask before deps).
- No domain queries here — this is plumbing only.

## Definition of done
The service can open and close a pooled connection driven entirely by config; unit test for DSN/toggle is green.

## Dependencies
S1 (Neon provisioned), M01.2 S1 (config). Consumed by S6 (readiness) and every feature milestone.
