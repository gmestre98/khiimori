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
- [x] Verified GCP Billing, Cloud Run, Cloud Monitoring, GCP Quotas, and Neon console are all reachable from a mobile browser — all are standard GCP/Neon web consoles (no native app required) (PRD §8.6).
- [x] `cost-guardrails-runbook.md` covers "I got a budget alert" (50%/90%/100% scenarios) and "the app is slow / I need capacity now" with phone-only paths for each lever.
- [x] Runbook lists both **mobile-reachable alert channels**: billing budget alerts (S1, Gmail) and 5xx error alerts (M01.7 S4, Gmail).
- [x] Each scale-up action in the runbook states expected **cost impact** and cross-links `scale-up-levers.md` for the precise delta.
- [x] Runbook dashboard URLs and `gcloud`/console paths reviewed for correctness.

## Constraints
- Operational and short — a phone-friendly checklist, not a manual.
- Don't introduce new tooling; rely on existing GCP/Neon dashboards (PRD §7.0).

## Definition of done
The author can, from a phone, open the dashboards and follow the runbook to scale up or respond to a budget alert.

## Dependencies
S1, S2, S3, S4; M01.7 S4 (error alert channel). Satisfies epic AC5; Milestone 10 verifies guardrails live.
