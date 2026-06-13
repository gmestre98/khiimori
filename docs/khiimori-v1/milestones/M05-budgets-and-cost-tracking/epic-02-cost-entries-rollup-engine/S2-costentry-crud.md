# S2 — Cost entry CRUD

## Context
Manual **cost entries** can be created/edited/deleted quickly — category, amount, note, optional day/
plan-item link (PRD §5.4). Builds on the schema (S1).

## Task
Implement create/edit/delete endpoints for cost entries.

## Acceptance criteria
- [ ] Endpoints create, edit, and delete a `CostEntry` (category, amount, note, optional day/plan-item
  link).
- [ ] Operations are **authorized** via the M03 `Authorizer` and **idempotent/queueable** for offline
  replay (shared queue).
- [ ] Category is validated; amount is EUR.
- [ ] A unit test covers create/edit/delete and an unauthorized attempt being denied.

## Constraints
- Keep mutations idempotent for offline replay (Milestone 04 queue, used by Epic 03 UI).
- A cost entry edit/delete must trigger the roll-up update (S4) — emit the change cleanly.

## Definition of done
Cost entries can be created/edited/deleted, authorized and replay-safe; tests green.

## Dependencies
S1, M03 Epic 04 (authz). Roll-ups in S3–S4.
