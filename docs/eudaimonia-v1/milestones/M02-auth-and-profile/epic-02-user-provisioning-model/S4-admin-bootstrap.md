# S4 — Admin bootstrap path (`is_admin`)

## Context
The first/author user must be designatable as `is_admin` without a public self-serve admin route, so
Milestone 08's backoffice has an operator (PRD §5.8 → §5.9). This is a deliberate, minimal bootstrap.

## Task
Add a mechanism to mark a designated user `is_admin = true` (e.g. a config-driven admin email matched at
provisioning, or a one-off admin command).

## Acceptance criteria
- [ ] A designated user can be set to `is_admin = true` via a **non-public** path (config-driven on
  provisioning and/or a one-off CLI/admin command) — documented in the story/epic.
- [ ] No public/self-serve route can set `is_admin`; the default remains `false` for everyone else.
- [ ] The chosen mechanism is **idempotent** (re-running doesn't break) and safe to run once at setup.
- [ ] A unit test covers that the bootstrap marks exactly the designated user and leaves others
  unchanged.

## Constraints
- Keep it minimal (PRD §5.9 "minimal backoffice"); this only sets the flag — backoffice UI is Milestone
  08.
- If config-driven by email, match against the verified Google email, and document the precedence with
  S3's identity refresh.

## Definition of done
A designated user becomes `is_admin` via a non-public bootstrap; others stay non-admin; test is green.

## Dependencies
S1, S2. Consumed by Milestone 08 (backoffice gating).
