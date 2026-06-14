# Epic M01.8 — Cost Guardrails (billing budget, Maps caps, scale-up levers)

> Milestone: [01 — Foundations](../README.md) · PRD refs: §8.4, §8.5, §8.6.

## Description

Put the financial safety rails in place on day one — the single step the PRD says prevents nearly
all bill surprises. Provision a GCP billing budget + alert, hard-cap the Maps API, confirm the
scale-to-zero defaults, and document the single-setting scale-up levers and mobile-reachable
dashboards.

**Estimated effort:** ~1–2 developer-days (one developer).

**Status:** ✅ Done — all 5 stories merged; cost-guardrails-runbook.md written; live `pulumi up` with billingAccount set is the author's confirm step post-deploy.

## Acceptance Criteria

- [x] A **GCP billing budget + alert (~€10/mo)** is provisioned via IaC (PRD §8.5).
- [x] The Maps API key has **hard quota caps** set via IaC; API restrictions documented as a one-time console step (apikeys module absent from @pulumi/gcp v9.26.0) (PRD §8.4 #2, §8.5).
- [x] Defaults confirmed **scale-to-zero** (Cloud Run `minInstances=0` with drift guard; Neon free-tier autosuspend documented) so the idle bill is ≈€0 (PRD §8.1, §8.6).
- [x] Scale-up levers (Neon tier, Cloud Run `min-instances`, Maps quota, billing budget) are documented as **single settings** in `scale-up-levers.md`, both IaC and dashboard-toggleable (PRD §8.6).
- [x] GCP/Neon dashboards confirmed **reachable from mobile**; `cost-guardrails-runbook.md` covers budget alerts and capacity scale-up scenarios with phone-only paths (PRD §8.6).

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

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-billing-budget-alert.md) | GCP billing budget + alert (IaC) | ~3h | AC1 | M01.4, M01.7 S4 |
| [S2](S2-maps-key-restrictions-caps.md) | Maps API key restriction + hard quota caps | ~3h | AC2 | M01.4 S4 |
| [S3](S3-confirm-scale-to-zero.md) | Confirm scale-to-zero defaults (Cloud Run + Neon) | ~2.5h | AC3 | M01.4 S9, M01.3 |
| [S4](S4-scale-up-levers-single-settings.md) | Scale-up levers as single settings (IaC + dashboard) | ~3h | AC4 | S1, S2, M01.4 S9 |
| [S5](S5-mobile-dashboards-runbook.md) | Mobile-dashboard check + mid-trip scale-up runbook | ~2.5h | AC5 | S1–S4 |

**Total:** ~14h (≈ 2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Billing budget ─┐
S2 Maps caps ──────┼─ S4 Scale-up levers ── S5 Mobile dashboards + runbook
S3 Scale-to-zero ──┘
```

S1, S2, and S3 are independent (all extend the M01.4 stack) and can run in parallel; S4 consolidates the
levers and S5 writes the phone-friendly runbook on top.
