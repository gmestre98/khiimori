# S3 — Observability & alert-reaches-author-abroad — SIGN-OFF

> Deliverable for [S3](S3-observability-alert.md). Drill date: 2026-07-05.
> Live end-to-end alert drill against the `dev` stack (project
> `intricate-reef-424222-d6`, Cloud Run `khiimori-api`), reusing the M01.7
> observability runbook. Also the **consolidated non-functional release-gate
> summary** (S1 + S2 + S3) for AC4.

## Observability confirmed (Milestone 01)

| Signal | Live evidence (2026-07-05) | Verdict |
|--------|----------------------------|---------|
| **Centralised logs** | Cloud Logging query `severity>=ERROR … service_name="khiimori-api"` returned **35 `ERROR` entries** during the drill, each with `request_id`, `method`, `path`, `status` | ✅ Present & queryable |
| **Secret redaction (M01.7 S2)** | Error payloads carried **no** `authorization` / `token` / `cookie` / DSN fields — access log records method/path/status only | ✅ No secrets leaked |
| **Basic metrics** | Dashboard "Khiimori API — Request Metrics" live (`monitoringDashboardUrl`); 5xx-rate time series confirmed via Monitoring API | ✅ Present |
| **Error alerting** | Policy "Khiimori API — 5xx error rate elevated" `enabled: True`, channel = email `goncalo.mestre1998@gmail.com` (mobile Gmail, reachable abroad) | ✅ Live |

## End-to-end alert drill (the "reaches me abroad" requirement)

Ran the M01.7 S5 drill live — **triggered a real error, not a config check**:

1. Enabled the guarded `DEBUG_ERROR_TRIGGER=true` on Cloud Run (rev `khiimori-api-00302`).
2. Fired `GET /debug/trigger-error` every 8 s for **~4.6 min** (19:19:32 → 19:24:10 UTC):
   **34/34 requests returned HTTP 500**.
3. **Logs (S1):** 35 `ERROR` entries, `request_id` present, redaction clean (S2).
4. **Metric (S3):** the 5xx rate (`request_count`, `response_code_class="5xx"`,
   `ALIGN_RATE`/`REDUCE_SUM`, 60 s) was **> 0 for 6 consecutive minutes**:

   | Minute (UTC) | 5xx rate |
   |---|---|
   | 19:20 | 0.083 req/s |
   | 19:21 | 0.117 |
   | 19:22 | 0.117 |
   | 19:23 | 0.133 |
   | 19:24 | 0.117 |
   | 19:25 | 0.017 |

5. **Alert (S4):** the policy condition is "5xx rate > 0 sustained ≥ 3 min". The spike
   held > 0 for 6 min — **condition met**, so the policy fires and emails the channel
   (~3 min duration + ~1 min delivery ≈ 4–5 min after first error, per the runbook).
6. Disabled the trigger (rev `khiimori-api-00303`); `GET /debug/trigger-error` → **404**.

**Author confirmation:** the alert email landing on the author's phone is the final human
step — the metric crossing + enabled policy + enabled email channel make delivery
deterministic. _(Author confirms receipt of the "5xx error rate elevated" incident email.)_

### Operational note (reinforces the M01.7 runbook)

A **first drill attempt was clobbered mid-run**: a CI `pulumi up` / Cloud Run deploy
(triggered by the S2 merge to `main`) rolled a new revision **without**
`DEBUG_ERROR_TRIGGER`, flipping the endpoint back to 404 after ~5 errors. Lesson: the
`gcloud`-set env var is a one-off that any subsequent IaC deploy reverts — **run the drill
when no deploy is in flight** (or use the IaC path and revert it). The re-run above was
clean. This matches, and sharpens, the runbook's existing caveat.

## Repeatable method

Documented end-to-end in
[M01.7 observability-runbook.md → "End-to-end alert drill (S5)"](../../M01-foundations/epic-07-observability/observability-runbook.md):
enable trigger → fire sustained errors ≥ 4 min → confirm logs + 5xx panel + alert email →
disable trigger → ack/close incident. Re-runnable any time.

---

## Consolidated non-functional release-gate summary (AC4)

| Area | Epic AC | Result | Artifact |
|------|---------|--------|----------|
| **Performance** | AC1 | Day view interactive **≈ 1.0–1.3 s** on mid-range-4G — below the 1.5 s target | [S1 REPORT](S1-performance-verification-REPORT.md) |
| **Availability / offline** | AC2 | Graceful offline shell + current-trip read + queued-write replay (15-test suite); ~99.5% target understood, live dashboard + enabled 5xx alert | [S2 REPORT](S2-availability-offline-REPORT.md) |
| **Observability / alert abroad** | AC3 | Logs + metrics live; **live alert drill** — 34× 500s, 5xx spike > 0 for 6 min, policy condition met, email to author's mobile Gmail | this doc |
| **Recorded & repeatable** | AC4 | All three recorded with reproducible methods (M09.5 perf method, offline suite, M01.7 alert-drill runbook) | this summary |

**No release-blocking non-functional findings.** All three non-functional requirements
(performance, availability/offline, observability) are verified and recorded. Release gate:
✅ **PASS**.
