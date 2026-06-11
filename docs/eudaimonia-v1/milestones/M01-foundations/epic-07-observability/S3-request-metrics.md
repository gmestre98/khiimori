# S3 — Basic request metrics in Cloud Monitoring

## Context
Beyond logs, the author needs at-a-glance health: **request rate, latency, and error rate** (PRD §6). Cloud
Run exports these to **Cloud Monitoring** out of the box; this story surfaces them on a dashboard and
confirms the error-rate signal that S4's alert will fire on.

Assumes a deployed Cloud Run service (M01.5).

## Task
Make basic request metrics (rate / latency / errors) available and visible in Cloud Monitoring.

## Acceptance criteria
- [ ] Request **rate**, **latency** (p50/p95), and **error rate** (5xx) are visible for the service in Cloud Monitoring.
- [ ] A small **dashboard** collects these (provisioned via IaC where practical — M01.4 — or documented if console-created).
- [ ] The **5xx error-rate** metric that S4 alerts on is identified and confirmed to populate.
- [ ] Prefer Cloud Run's **built-in** request metrics over custom instrumentation for v1 (keep it minimal).
- [ ] Documented: where the dashboard lives and how to read it.

## Constraints
- Use built-in metrics; don't add a metrics dependency/exporter unless asked (project rule, PRD §7.0).
- Stay within the free Monitoring allowance (PRD §8.1).

## Definition of done
A Cloud Monitoring dashboard shows rate/latency/error-rate for the deployed service, with the 5xx signal confirmed.

## Dependencies
M01.5 (deployed service); M01.4 if provisioning the dashboard via IaC. Feeds S4 (alert).
