# S9 — Scale tunables as IaC config (default scale-to-zero)

## Context
The PRD's cost posture is "**run at ≈€0, scale up on demand with a single setting**" (PRD §8.6). The scale
levers — Cloud Run `min-instances`, the Neon tier reference, and the Maps quota — must be **IaC config**
that defaults to scale-to-zero, so scaling up is changing a value, not a rewrite. This story makes those
tunables first-class typed config on the stack and wires `min-instances` into the S6 Cloud Run service.

Assumes the Cloud Run service (**S6**) exists.

## Task
Express the scale tunables as typed Pulumi stack config (defaulting to scale-to-zero) and apply
`min-instances` to Cloud Run.

## Acceptance criteria
- [ ] Stack config exposes: Cloud Run `minInstances` (default **0**) and `maxInstances`, a **Neon tier**
  reference value, and a **Maps daily quota** value (the cap enforcement itself is M01.8).
- [ ] Cloud Run `min-instances` is driven by that config and **defaults to 0** (scale-to-zero) (PRD §8.6).
- [ ] Changing `minInstances` in config + `pulumi up` is the **only** action needed to keep an instance warm
  (no code change) — verified by a preview diff.
- [ ] Each tunable is documented inline (what it costs to raise, where the matching dashboard toggle is).
- [ ] Defaults confirmed to produce an **idle ≈€0** posture (PRD §8.1, §8.6).

## Constraints
- Defaults must be the cheap ones; raising them is an explicit opt-in (PRD §8.6).
- This story defines the **levers**; the budget/alert and Maps hard caps are M01.8 — cross-link, don't duplicate.

## Definition of done
`pulumi preview` shows `min-instances` (=0) and the tier/quota values sourced from typed config; flipping
`minInstances` to 1 is a one-line config change that previews a warm instance.

## Dependencies
S6 (Cloud Run service). Cross-links to M01.8 (budget/alert, Maps caps). Satisfies epic AC4.
