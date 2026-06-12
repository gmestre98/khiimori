# S2 — Scale-up levers & mid-trip playbook validation

## Context
Each **scale-up lever must work as a single setting** (Neon tier, Cloud Run `min-instances`, Maps quota),
and the **mid-trip scale-up playbook** must be real: dashboards reachable from mobile, scale-up effective
in minutes with no redeploy/migration (PRD §8.6).

## Task
Validate the scale-up levers and exercise the mid-trip playbook.

## Acceptance criteria
- [ ] Each lever is confirmed **config-only** (single setting): Neon free→paid, Cloud Run
  `min-instances`, Maps quota cap — **no code change, no migration**.
- [ ] The playbook is **exercised**: flip a lever (e.g. Cloud Run `min-instances`), confirm the effect,
  flip it back — proving the mid-trip story.
- [ ] **Dashboards/runbook are reachable from mobile** (Milestone 01 Epic 08), so the author can act mid-
  trip.
- [ ] Scale-up is effective **in minutes** with no redeploy/migration.

## Constraints
- Actually exercise at least one lever (not just document it) — and revert it after (PRD §8.6).
- Reuse Milestone 01's mobile dashboards/runbook as the operator entry point.

## Definition of done
Scale-up levers are confirmed single-setting and the mid-trip playbook is validated by exercising a lever
from mobile.

## Dependencies
S1, Milestone 01 Epic 08 (scale tunables, dashboards/runbook), Milestone 03 (Neon), Milestone 07 (Maps).
