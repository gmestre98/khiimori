# S5 — End-to-end alert verification + runbook

## Context
An alert that has never fired is not an alert. The epic requires proving the chain works: a deliberately
triggered error produces the alert that reaches the author (PRD §6, epic AC5). This story does that
verification and writes the short runbook so it stays trustworthy.

Assumes the alert policy + channel (**S4**) and logs/metrics (**S1**, **S3**) exist.

## Task
Trigger a controlled error on the deployed service, confirm the alert reaches the channel, and document it.

## Acceptance criteria
- [ ] A **safe, deliberate** error is triggered on the deployed service (e.g. a guarded test-only error route, or a controlled fault).
- [ ] The error appears in Cloud Logging (as `ERROR`, with request id — S1) and drives the metric (S3).
- [ ] The **alert fires** and the notification is received on the mobile-reachable channel (S4) — verified, with timing noted.
- [ ] Logs confirm **no secrets/tokens** leaked during the incident (S2).
- [ ] A short **runbook** documents: how to trigger a test alert, expected signal/latency, and how to silence/ack.

## Constraints
- Any test-only error path must be **safe and clearly guarded** (not exploitable, off in normal operation) (PRD §6).
- Don't leave the test trigger enabled or noisy after verification.

## Definition of done
A triggered error produces a received mobile alert with clean (secret-free) logs, and the runbook is written.

## Dependencies
S1, S2, S3, S4. Satisfies epic AC5; Milestone 10 re-verifies as part of hardening.
