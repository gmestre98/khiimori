# S1 — `geo.*` schema & module skeleton

## Context
Milestone 07 introduces the `geo` module — the backend proxy for Google Maps Platform. Per
schema-per-module (PRD §7.7), it owns a **`geo.*`** schema (for caches, Epic 02). This story scaffolds the
module and schema.

## Task
Scaffold the `geo` module and a `geo.*` schema migration.

## Acceptance criteria
- [ ] The `geo` module skeleton exists (mounted in the service per M01.2's route mounting), with its
  package boundary respected (M01.1 boundaries).
- [ ] A migration creates the **`geo`** schema (initially for the geocode cache used in Epic 02).
- [ ] The module exposes no Maps functionality yet beyond the placeholder — interface in S2.
- [ ] The migration applies cleanly via the M01.3 runner.

## Constraints
- Follow M01.1 module-boundary and M01.3 migration conventions.
- No Maps API key handling yet (S3); no provider logic yet (S2).

## Definition of done
The `geo` module and `geo.*` schema exist and build/migrate cleanly.

## Dependencies
M01.1 (module skeletons), M01.2 (route mounting), M01.3 (migrations). Consumed by S2–S5, Epic 02.
