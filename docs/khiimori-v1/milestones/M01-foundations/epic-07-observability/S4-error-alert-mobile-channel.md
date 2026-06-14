# S4 — Error alert to a mobile-reachable channel

> **Status:** ✅ Done — Pulumi `gcp.monitoring.AlertPolicy` (5xx rate > 0 for 3 min) + `NotificationChannel` (email/Gmail, mobile-reachable); threshold rationale and ack steps documented in runbook ([#146](https://github.com/gmestre98/khiimori/pull/146)).

## Context
The whole point of this epic: when something breaks while the author is **abroad**, an alert reaches a
channel they actually see on mobile (PRD §6, §8.6). This story provisions an alerting policy on the
error-rate signal (S3) and a notification channel reachable on a phone abroad.

Assumes request metrics / error signal (**S3**) and the IaC stack (M01.4) exist.

## Task
Provision an error alert policy + a mobile-reachable notification channel via IaC.

## Acceptance criteria
- [x] An alerting policy fires on a meaningful **error condition** (e.g. sustained 5xx rate, or error-log-based metric).
- [x] At least one **notification channel** is wired that the author sees on mobile abroad (email + mobile push, or similar) — choice documented (PRD §6, §8.6).
- [x] The policy + channel are defined in **IaC** (extends the M01.4 Pulumi stack) so they're reproducible.
- [x] Thresholds avoid noise (no flapping on a single transient 5xx) — documented rationale.
- [x] No secrets/PII in the alert payload (PRD §8.5).

## Constraints
- Reuse the M01.4 Pulumi stack — one language, one place (PRD §7.4).
- Keep within free Monitoring/alerting allowances (PRD §8.1).

## Definition of done
`pulumi up` provisions the alert policy + mobile-reachable channel on the error signal; config is reproducible.

## Dependencies
S3 (error signal), M01.4 (IaC stack). Verified end-to-end in S5.
