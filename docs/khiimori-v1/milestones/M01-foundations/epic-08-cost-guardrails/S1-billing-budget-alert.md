# S1 — GCP billing budget + alert (IaC)

> **Status:** ✅ Done — `gcp.billing.Budget` (50/90/100% thresholds, EUR, email channel from M01.7 S4) in `infra/billing.ts`; `billingBudgetsApi` enabled in `services.ts`; `khiimori:billingAccount` + `khiimori:billingBudgetEur` config documented. Budget skips gracefully (with a logged warning) until the author sets `billingAccount` ([#PR](https://github.com/gmestre98/khiimori)).

## Context
The single step the PRD says prevents nearly all bill surprises is a **billing budget + alert** (PRD §8.5).
This story provisions a ~€10/mo budget with threshold alerts via Pulumi, extending the M01.4 stack, so any
unexpected spend is caught immediately — vital while the author is abroad.

Assumes the IaC stack (M01.4) and a billing-enabled GCP project (author-provided, PRD §8.3) exist.

## Task
Provision a GCP billing budget (~€10/mo) with alert thresholds via Pulumi.

## Acceptance criteria
- [ ] A **billing budget** (~€10/mo) is provisioned via IaC against the project's billing account (PRD §8.5).
- [ ] **Threshold alerts** (e.g. 50/90/100%) notify a channel the author sees on mobile abroad (reuse/align with M01.7 S4 channel).
- [ ] The amount and thresholds are **config values** (easy to raise when scaling up intentionally).
- [ ] Defined in the **M01.4 Pulumi stack** — reproducible via `pulumi up`.
- [ ] No secrets/PII in alert payloads (PRD §8.5).

## Constraints
- Reuse the M01.4 stack and (where possible) the M01.7 notification channel — one place, one language (PRD §7.4).
- The budget **alerts**; it does not auto-cap spend — pair with the Maps caps (S2) and scale-to-zero defaults (S3).

## Definition of done
`pulumi up` provisions a ~€10/mo budget with mobile-reachable threshold alerts; amount/thresholds are config.

## Dependencies
M01.4 (IaC stack), M01.7 S4 (notification channel). Author-provided billing account. Satisfies epic AC1.
