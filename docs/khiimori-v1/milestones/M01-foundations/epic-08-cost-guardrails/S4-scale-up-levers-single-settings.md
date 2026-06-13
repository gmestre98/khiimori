# S4 — Scale-up levers as single settings (IaC + dashboard)

## Context
The PRD's plan is "run at ≈€0, **scale up on demand with a single setting**" (PRD §8.6). The levers — Neon
tier, Cloud Run `min-instances`, Maps quota — already exist as IaC config (M01.4 S9, this epic's S1/S2).
This story makes them genuinely single-setting: documented, with the matching dashboard toggle for each, so
scaling mid-trip is never a rewrite.

Assumes the scale config (M01.4 S9), budget (**S1**), and Maps caps (**S2**) exist.

## Task
Document each scale-up lever as a single IaC setting with its equivalent dashboard toggle.

## Acceptance criteria
- [ ] Each lever — **Neon tier**, Cloud Run **`min-instances`**, **Maps quota** — is documented as a **single config value** + a `pulumi up` (PRD §8.6).
- [ ] For each, the **dashboard equivalent** (Neon console, Cloud Run console, GCP quotas) is documented for when the author has only a phone.
- [ ] Each lever notes its **cost delta** (what raising it roughly costs/mo) so the trade-off is explicit (PRD §8.6).
- [ ] Cross-links the IaC definitions (M01.4 S9) and the budget (S1) so raising a lever and its budget impact are connected.
- [ ] No lever requires a code change or redeploy of app logic to flip.

## Constraints
- Single-setting is the bar — if a lever needs more than one change, fix that, don't just document it (PRD §8.6).
- Don't duplicate the IaC definitions; reference them.

## Definition of done
A reader can flip any scale-up lever via one IaC setting **or** the documented dashboard toggle, knowing the cost.

## Dependencies
M01.4 S9 (scale tunables), S1 (budget), S2 (Maps quota). Satisfies epic AC4.
