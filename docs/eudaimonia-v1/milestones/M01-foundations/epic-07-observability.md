# Epic M01.7 — Observability (logs, metrics, alerting)

> Milestone: [01 — Foundations](README.md) · PRD refs: §6.

## Description

Make problems visible — especially when the author is abroad. Ship centralised structured logs,
basic request metrics, and at least one error alert that reaches a channel the author actually sees
while travelling.

## Acceptance Criteria

- [ ] Structured JSON logs from the service flow to **Cloud Logging**.
- [ ] Basic request metrics (rate/latency/errors) are available in Cloud Monitoring.
- [ ] At least one **error alert** is wired to a channel the author sees **while abroad** (PRD §6).
- [ ] Logs **exclude secrets and tokens** (PRD §6, §8.5).
- [ ] Verified end-to-end: a deliberately triggered error produces the alert.

## Implementation Details / Architecture

- Builds on the structured logging from the `platform` layer (M01.2).
- Logging/Monitoring sit within the free tier (50 GB logs/mo — PRD §8.1).
- Alert channel choice (email/push) documented; must be reachable on mobile abroad (PRD §6, §8.6).

## Dependencies

- **Upstream:** M01.2 (logging), M01.4 (alerting resources via IaC), M01.5 (deployed service to observe).
- **Downstream:** Milestone 10 verifies alerting reaches the author as part of hardening.

## Costs Impact

None — Cloud Logging/Monitoring within the free allowance (PRD §8.1).

## Designs

N/A.
