# Epic M01.8 — Cost Guardrails (billing budget, Maps caps, scale-up levers)

> Milestone: [01 — Foundations](README.md) · PRD refs: §8.4, §8.5, §8.6.

## Description

Put the financial safety rails in place on day one — the single step the PRD says prevents nearly
all bill surprises. Provision a GCP billing budget + alert, hard-cap the Maps API, confirm the
scale-to-zero defaults, and document the single-setting scale-up levers and mobile-reachable
dashboards.

**Estimated effort:** ~1–2 developer-days (one developer).

## Acceptance Criteria

- [ ] A **GCP billing budget + alert (~€10/mo)** is provisioned via IaC (PRD §8.5).
- [ ] The Maps API key is **restricted** and has **hard quota caps** set (PRD §8.4 #2, §8.5).
- [ ] Defaults confirmed **scale-to-zero** (Cloud Run, Neon) so the idle bill is ≈€0 (PRD §8.1, §8.6).
- [ ] Scale-up levers (Neon tier, Cloud Run `min-instances`, Maps quota) are documented as **single settings**, both IaC and dashboard-toggleable (PRD §8.6).
- [ ] GCP/Neon dashboards confirmed **reachable from mobile**, with a short mid-trip scale-up runbook (PRD §8.6).

## Implementation Details / Architecture

- Extends the Pulumi stack from M01.4 with budget/alert + Maps restrictions (one language, one place).
- Encodes the PRD §8.6 "run-at-€0, scale-up-on-demand" plan as config + a runbook, so scaling is
  never a rewrite.
- Maps caps here protect the proxy built in Milestone 07 (Maps) before it can ever overspend.

## Dependencies

- **Upstream:** M01.4 (IaC stack to extend). Author-provided: billing-enabled GCP project (PRD §8.3).
- **Downstream:** Milestone 07 (Maps) relies on the caps; Milestone 10 verifies guardrails live.

## Costs Impact

This is the project's **cost-control epic** (PRD §8.5). It adds **no spend** itself; it caps the two
named risks — **Maps overage / leaked key** (PRD §8.4 #2) and runaway compute — and locks in the
**≈€0 idle / single-setting scale-up** posture (PRD §8.6).

## Designs

N/A.
