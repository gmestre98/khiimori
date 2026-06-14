# S4 — Scale-up levers as single settings (IaC + dashboard)

> **Status:** ✅ Done — `scale-up-levers.md` documents each lever (Neon tier, Cloud Run min/max-instances, Maps quota, billing budget) as a single config value + `pulumi up`, with dashboard equivalent and cost delta. All levers are one-setting flips; no code change or redeploy needed beyond `pulumi up`.

## Context
The PRD's plan is "run at ≈€0, **scale up on demand with a single setting**" (PRD §8.6). The levers — Neon
tier, Cloud Run `min-instances`, Maps quota — already exist as IaC config (M01.4 S9, this epic's S1/S2).
This story makes them genuinely single-setting: documented, with the matching dashboard toggle for each, so
scaling mid-trip is never a rewrite.

Assumes the scale config (M01.4 S9), budget (**S1**), and Maps caps (**S2**) exist.

## Task
Document each scale-up lever as a single IaC setting with its equivalent dashboard toggle.

## Acceptance criteria
- [x] Each lever (Neon tier, Cloud Run `min-instances` + `max-instances`, Maps quota, billing budget) is a **single config value** + `pulumi up` — documented in `scale-up-levers.md` (PRD §8.6).
- [x] **Dashboard equivalent** (Neon console, Cloud Run console, GCP Quotas, GCP Billing) documented for phone-only access in `scale-up-levers.md`.
- [x] Each lever has an explicit **cost delta** estimate (`scale-up-levers.md` Cost delta column) (PRD §8.6).
- [x] Cross-links IaC definitions (`tunables.ts`, `billing.ts`, `mapsKey.ts`) and budget — "raise a lever → also raise budget alert" noted in `scale-up-levers.md`.
- [x] No lever requires a code change or app redeploy — all are config-only + `pulumi up`.

## Constraints
- Single-setting is the bar — if a lever needs more than one change, fix that, don't just document it (PRD §8.6).
- Don't duplicate the IaC definitions; reference them.

## Definition of done
A reader can flip any scale-up lever via one IaC setting **or** the documented dashboard toggle, knowing the cost.

## Dependencies
M01.4 S9 (scale tunables), S1 (budget), S2 (Maps quota). Satisfies epic AC4.
