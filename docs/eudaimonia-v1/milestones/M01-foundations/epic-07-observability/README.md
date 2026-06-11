# Epic M01.7 — Observability (logs, metrics, alerting)

> Milestone: [01 — Foundations](../README.md) · PRD refs: §6.

## Description

Make problems visible — especially when the author is abroad. Ship centralised structured logs,
basic request metrics, and at least one error alert that reaches a channel the author actually sees
while travelling.

**Estimated effort:** ~1–2 developer-days (one developer).

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

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-logs-to-cloud-logging.md) | Structured logs flow to Cloud Logging | ~3h | AC1 | M01.2 S2, M01.5 |
| [S2](S2-secret-redaction.md) | Secret & token redaction in logs | ~3h | AC4 | M01.2 S2/S5, S1 |
| [S3](S3-request-metrics.md) | Basic request metrics in Cloud Monitoring | ~3h | AC2 | M01.5 |
| [S4](S4-error-alert-mobile-channel.md) | Error alert to a mobile-reachable channel | ~3h | AC3 | S3, M01.4 |
| [S5](S5-verify-alert-e2e.md) | End-to-end alert verification + runbook | ~2.5h | AC5 | S1–S4 |

**Total:** ~14.5h (≈ 2 dev-days), consistent with the epic's ~1–2 dev-day estimate.

### Sequencing

```
S1 Logs → Cloud Logging ── S2 Redaction ─┐
S3 Request metrics ── S4 Error alert ─────┴─ S5 End-to-end verification + runbook
```

S1/S2 (logging track) and S3/S4 (metrics+alert track) can proceed in parallel; both converge at S5.
