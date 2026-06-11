# S4 — Schema-per-module layout & initial schemas

## Context
Each domain module owns its own Postgres **schema** (`auth.*`, `trip.*`, `budget.*`, `journal.*`,
`sharing.*`, `geo.*`) so a module can later move to its own service/DB **without a data redesign**
(PRD §7.7, §7.0). This story creates the initial (empty) schemas and the per-module migration structure so
feature milestones just add tables under their own schema.

Assumes the migration tool + conventions from **S3** exist.

## Task
Create a migration (or migrations) that establishes one Postgres schema per domain module, and organise
migration files per module.

## Acceptance criteria
- [ ] A migration creates the six schemas: `auth`, `trip`, `budget`, `journal`, `sharing`, `geo`
  (`CREATE SCHEMA IF NOT EXISTS …`), each owned by the application role.
- [ ] Migrations are organised so each module's future tables live under its own schema and migration grouping.
- [ ] No cross-schema foreign keys are introduced yet (keeps modules peelable); document this convention.
- [ ] Up applies all schemas; down removes them cleanly on a throwaway DB.
- [ ] Naming/placement convention for future per-module migrations is documented.

## Constraints
- Schemas only — **no domain tables** in this epic (those come with each feature milestone).
- Keep the application role's privileges scoped to these schemas (least privilege, PRD §6).

## Definition of done
Running migrations on a clean DB yields exactly the six empty module schemas; down reverts them.

## Dependencies
S3 (migration tool). Precedes S5 (runner) and S6 (readiness can assume schemas exist).
