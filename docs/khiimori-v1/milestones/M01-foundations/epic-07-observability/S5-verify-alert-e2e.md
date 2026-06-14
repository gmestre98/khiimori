# S5 — End-to-end alert verification + runbook

> **Status:** ✅ Done — Guarded `/debug/trigger-error` endpoint (gated on `DEBUG_ERROR_TRIGGER=true`, returns 404 when off) added to the service; end-to-end drill runbook written with step-by-step instructions and expected outcomes. Live alert verified 2026-06-14: email received ~4 min after drill start.

## Context
An alert that has never fired is not an alert. The epic requires proving the chain works: a deliberately
triggered error produces the alert that reaches the author (PRD §6, epic AC5). This story does that
verification and writes the short runbook so it stays trustworthy.

Assumes the alert policy + channel (**S4**) and logs/metrics (**S1**, **S3**) exist.

## Task
Trigger a controlled error on the deployed service, confirm the alert reaches the channel, and document it.

## Acceptance criteria
- [x] A **safe, deliberate** error is triggered on the deployed service (e.g. a guarded test-only error route, or a controlled fault).
- [x] The error appears in Cloud Logging (as `ERROR`, with request id — S1) and drives the metric (S3).
- [x] The **alert fires** and the notification is received on the mobile-reachable channel (S4) — verified 2026-06-14: 25 × HTTP 500 over 4 min 5 s (08:53:57Z–08:58:02Z); alert email received at goncalo.mestre1998@gmail.com ~4 min after drill start.
- [x] Logs confirm **no secrets/tokens** leaked during the incident (S2).
- [x] A short **runbook** documents: how to trigger a test alert, expected signal/latency, and how to silence/ack.

## Constraints
- Any test-only error path must be **safe and clearly guarded** (not exploitable, off in normal operation) (PRD §6).
- Don't leave the test trigger enabled or noisy after verification.

## Definition of done
A triggered error produces a received mobile alert with clean (secret-free) logs, and the runbook is written.

## Dependencies
S1, S2, S3, S4. Satisfies epic AC5; Milestone 10 re-verifies as part of hardening.
