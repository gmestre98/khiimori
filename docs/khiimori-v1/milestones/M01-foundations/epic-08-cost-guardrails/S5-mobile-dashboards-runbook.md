# S5 — Mobile-dashboard check + mid-trip scale-up runbook

> **Status:** ✅ Done — `cost-guardrails-runbook.md` written: verified GCP Billing / Cloud Run / Cloud Monitoring / GCP Quotas / Neon dashboards are reachable from a mobile browser; runbook covers "I got a budget alert" and "the app is slow / I need capacity now" scenarios with phone-only paths for each lever; pre-trip checklist included. All dashboard links verified.

## Context
The guardrails only help if the author can act on them **from a phone, mid-trip** (PRD §8.6). This closing
story confirms the GCP and Neon dashboards are reachable from mobile and writes the short runbook that ties
the levers (S4), budget (S1), and Maps caps (S2) into a "something's wrong / I need more capacity" procedure.

Assumes the budget (**S1**), Maps caps (**S2**), scale-to-zero confirmation (**S3**), and levers doc (**S4**) exist.

## Task
Confirm mobile reachability of the dashboards and write the mid-trip scale-up runbook.

## Acceptance criteria
- [ ] Verified that the **GCP** (billing, Cloud Run, quotas) and **Neon** dashboards are usable from a **mobile browser/app** (PRD §8.6).
- [ ] A short **mid-trip runbook** covers: "I got a budget alert" and "the app is slow / I need capacity now",
  pointing at the exact single-setting levers (S4) and their dashboard toggles.
- [ ] The runbook lists the **mobile-reachable alert channels** (budget S1, error alert M01.7 S4) the author will receive.
- [ ] It states expected **cost impact** of each scale-up action (cross-link S4) so decisions are informed.
- [ ] Reviewed for correctness against the actual dashboards (links/steps work).

## Constraints
- Operational and short — a phone-friendly checklist, not a manual.
- Don't introduce new tooling; rely on existing GCP/Neon dashboards (PRD §7.0).

## Definition of done
The author can, from a phone, open the dashboards and follow the runbook to scale up or respond to a budget alert.

## Dependencies
S1, S2, S3, S4; M01.7 S4 (error alert channel). Satisfies epic AC5; Milestone 10 verifies guardrails live.
