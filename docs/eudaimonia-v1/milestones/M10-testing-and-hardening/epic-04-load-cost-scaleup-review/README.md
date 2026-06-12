# Epic M10.4 — Load/cost review & scale-up playbook

> Milestone: [10 — Testing & Hardening](../README.md) · PRD refs: §8.4, §8.5, §8.6.

## Description

The cost-verification epic. Run a light **load/cost review** confirming the project's **≈€0–3/mo idle**
posture, that each **scale-up lever works as a single setting** (Neon tier, Cloud Run
`min-instances`, Maps quota), and that the **mid-trip scale-up playbook** is real: dashboards
reachable from mobile, scale-up effective in minutes with no redeploy/migration. Confirm Maps caps +
billing budget/alert are active, and watch CI minutes against the free cap.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] A light **load/cost review** confirms the expected **≈€0–3/mo idle** posture and that scale-up
      levers (**Neon tier, Cloud Run `min-instances`, Maps quota**) work as **single settings**
      (PRD §8.6).
- [ ] The **mid-trip scale-up playbook** is validated: **dashboards reachable from mobile**, scale-up
      **effective in minutes with no redeploy/migration** (PRD §8.6).
- [ ] **Maps key restricted with hard quota caps** and **GCP billing budget + alert active** are
      verified **live** (PRD §8.5).
- [ ] **Scale-to-zero** is confirmed for the stateless services, and the DB scale-up lever (Neon
      free → paid) is confirmed config-only (PRD §8.4 #1, §8.6).
- [ ] **CI minutes** are watched against the **2,000-min free cap** (or the repo kept public)
      (PRD §8.4 #4).

## Implementation Details / Architecture

- A **checklist review** against PRD §8: confirm scale-to-zero, billing alert, Maps caps, and that
  each scale-up lever is **config-only** (PRD §8.5–8.6) — not a code change.
- The playbook is **exercised**, not just documented: flip a lever (e.g. Cloud Run `min-instances`),
  confirm the effect, flip it back — proving the mid-trip story from a phone (PRD §8.6).
- Reuses the **mobile dashboards/runbook** from Milestone 01's cost-guardrails epic as the operator's
  entry point.

## Dependencies

- **Upstream:** Milestone 01 (billing budget/alert, Maps caps, scale tunables, dashboards/runbook),
  Milestone 07 (Maps usage), Milestone 03 (Neon DB).
- **Downstream:** a release gate — the author depends on this posture mid-trip.

## Costs Impact

This epic **verifies** the project's cost guardrails rather than adding cost: ≈€0–3/mo idle, billing
budget/alert live, Maps quota caps, scale-to-zero, single-setting scale-up levers (PRD §8.5–8.6).
**CI minutes** are the one running cost to watch (PRD §8.4 #4).

## Designs

No UI — a cost/operations review deliverable (PRD §8).
