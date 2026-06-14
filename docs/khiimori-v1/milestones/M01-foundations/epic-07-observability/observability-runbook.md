# Observability runbook (M01.7)

How to find logs, read the metrics, and react to an alert for the deployed
`khiimori-api` Cloud Run service. Grown story-by-story across epic M01.7; the
end-to-end alert drill lives in [S5](S5-verify-alert-e2e.md).

- **Project:** `intricate-reef-424222-d6` · **Region:** `europe-west2`
- **Service:** Cloud Run `khiimori-api`

---

## Logs (S1) — structured logs in Cloud Logging

On Cloud Run, the container's **stdout JSON is ingested by Cloud Logging
automatically** — no agent or sidecar. The service's logger (`platform/log`)
emits each line with Cloud Logging's conventional fields so entries are
structured and severity-classified rather than opaque text:

| Logger output field | Source | Why |
|---|---|---|
| `severity` | slog level (`WARN`→`WARNING`) | classifies entries; `ERROR` drives the S4 alert |
| `message` | slog `msg` | the entry's display text |
| `time` | slog timestamp (RFC3339) | recognised entry timestamp |
| `request_id` | request-id middleware | correlate every line of one request |
| `logging.googleapis.com/trace` | `X-Cloud-Trace-Context` + project id | links logs to the Cloud Run trace (when present) |
| `logging.googleapis.com/spanId` | `X-Cloud-Trace-Context` | span within the trace |

Per the project-wide v1 policy the service emits **error-level logs only**, so a
healthy service is quiet and anything in the logs is worth a look.

### Find all errors for a request

Open **Logs Explorer** (Console → Logging → Logs Explorer) and run:

```
resource.type="cloud_run_revision"
resource.labels.service_name="khiimori-api"
severity>=ERROR
```

To pull **every line for one request** (e.g. from an error a user quoted by its
`X-Request-Id`), filter on the request id:

```
resource.type="cloud_run_revision"
resource.labels.service_name="khiimori-api"
jsonPayload.request_id="<the-request-id>"
```

Or, when you have a trace, click **"Show trace details"** on any entry — the
`logging.googleapis.com/trace` field groups all of that request's logs together.

### gcloud equivalent

```
gcloud logging read \
  'resource.type="cloud_run_revision" AND resource.labels.service_name="khiimori-api" AND severity>=ERROR' \
  --project intricate-reef-424222-d6 --limit 20 --freshness 1h
```

---

## Secret redaction (S2) — secrets never reach the logs

Logs must exclude secrets and tokens (PRD §6, §8.5). Redaction is a property of
the **shared logger** (`platform/log`), not a discipline each caller must
remember: the handler replaces the value of any attribute whose key names a
secret with `[REDACTED]` before the line is written, at every nesting level.

Keys are matched **case-insensitively by substring**, so variants are caught
too. Redacted fragments: `authorization`, `password`, `passwd`, `secret`
(incl. `client_secret`), `token` (incl. `access_token`, `refresh_token`),
`api_key` / `api-key` / `apikey`, `cookie` (incl. `set-cookie`), `db_url`,
`database_url`, `dsn`, `credential`.

The HTTP access log additionally records only method, **URL path** (never the
raw query string), status, and duration — it logs **no request headers**, so
`Authorization` / `Cookie` and any secret query param can't leak there.

### Logging guideline (for every module)

- **Pass secrets as structured attribute values under a descriptive key** —
  `logger.Error("auth failed", "client_secret", s)` — so redaction can see and
  strip them. Never interpolate a secret into the message string
  (`logger.Error("token=" + t)`), which the handler can't inspect.
- Don't log whole pre-marshalled blobs (a JSON string, a struct serialized by
  hand) that might embed a secret — redaction works on attribute keys, not on
  opaque text already turned into a value.
- When in doubt, omit. A missing log line is cheaper than a leaked credential.

A unit test (`platform/log`) asserts that logging each sensitive key — flat and
nested in a group — produces redacted output.

---

## Metrics (S3) — Cloud Monitoring dashboard

Cloud Run exports request metrics automatically to **Cloud Monitoring** — no custom
exporter or instrumentation needed. The dashboard (`infra/monitoring.ts`) is
provisioned by Pulumi and shows three panels:

| Panel | Metric | What it tells you |
|---|---|---|
| Request rate | `run.googleapis.com/request_count` — rate/s by response class | How much traffic and the healthy/error split |
| Latency p50 / p95 | `run.googleapis.com/request_latencies` — distribution percentiles | Whether the service is slow (cold start vs regression) |
| 5xx error rate | `run.googleapis.com/request_count` filtered to `response_code_class="5xx"` — rate/s | How fast errors are happening — the same signal the S4 alert fires on |

### Finding the dashboard

After `pulumi up` runs (CI on merge), the dashboard URL is in the Pulumi stack
output `monitoringDashboardUrl`:

```
pulumi stack output monitoringDashboardUrl --stack goncalo-mestre1998-gmail-com/khiimori/dev
```

Or navigate to **Cloud Console → Monitoring → Dashboards** and look for
**"Khiimori API — Request Metrics"**.

### The 5xx signal (used by the S4 alert)

The alert policy (S4) fires on the same metric as the dashboard's 5xx panel:

```
metric.type="run.googleapis.com/request_count"
resource.type="cloud_run_revision"
resource.labels.service_name="khiimori-api"
metric.labels.response_code_class="5xx"
```

Aggregation: `ALIGN_RATE`, `REDUCE_SUM`, 60 s alignment period. When this
rate exceeds the threshold for the alert's window (see S4), the policy fires.

---

## Alerting (S4) — error alert to a mobile-reachable channel

**Channel:** email to `goncalo.mestre1998@gmail.com` (Gmail, accessible on mobile
abroad — PRD §6, §8.6). To change the recipient, set `khiimori:alertEmail` in
the Pulumi stack config and re-run `pulumi up`.

**Policy:** `Khiimori API — 5xx error rate elevated` (provisioned by Pulumi in
`infra/alerting.ts`).

**Condition:** 5xx error rate > 0, sustained for **3 minutes**.

| Setting | Value | Rationale |
|---|---|---|
| Metric | `run.googleapis.com/request_count` | Built-in Cloud Run metric |
| Filter | `response_code_class="5xx"` | Only server errors |
| Aligner | `ALIGN_RATE`, 60 s windows | Errors per second |
| Reducer | `REDUCE_SUM` | All revisions summed |
| Comparison | `> 0` | Any 5xx rate |
| Duration | 180 s (3 min) | Avoids noise from a single transient error |
| Auto-close | 7 days | Stale incidents don't accumulate |

### When you receive an alert

1. Open the Cloud Monitoring alert email link → view the incident timeline.
2. Go to **Logs Explorer** and run the error query (S1 section above).
3. Identify the request id from the first `ERROR` entry.
4. Filter by request id to trace the failure.
5. If the error is resolved, **acknowledge** the incident in Cloud Monitoring
   to silence notifications.

### Silencing / acknowledging

In Cloud Monitoring → **Alerting → Incidents**, find the open incident and click
**Acknowledge**. This silences notifications while you investigate, without
closing the incident. Click **Close** once the underlying issue is fixed.

To test-fire the alert without waiting for a real error, see S5 below.

---

## End-to-end alert drill (S5) — how to verify the full chain

The service ships a **guarded test-only error endpoint** (`/debug/trigger-error`)
controlled by the env var `DEBUG_ERROR_TRIGGER=true`. When disabled (default),
the path returns 404 and is not discoverable. Enable it temporarily for the
drill, then remove it.

### Step-by-step drill

**1. Enable the trigger (IaC approach — recommended)**

Add `DEBUG_ERROR_TRIGGER: "true"` to the Cloud Run env via Pulumi:

```
# infra/cloudRun.ts → envs array, temporarily:
{ name: 'DEBUG_ERROR_TRIGGER', value: 'true' },
```

Commit, push to main, wait for CI's `pulumi up` + `deploy` jobs to finish
(~3–5 min). The new revision is live when CI's "Verify deployed revision" step
passes.

Alternatively, via gcloud directly (faster for a one-off drill, no IaC change):

```bash
gcloud run services update khiimori-api \
  --region europe-west2 \
  --project intricate-reef-424222-d6 \
  --update-env-vars DEBUG_ERROR_TRIGGER=true
```

**2. Trigger repeated errors**

Hit the endpoint several times per minute for ~4 minutes so the 5xx rate is
sustained above the alert threshold (> 0 for 3 min):

```bash
SERVICE_URL=https://khiimori-api-qectzihgmq-nw.a.run.app
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" "$SERVICE_URL/debug/trigger-error"
  sleep 10
done
```

Each request returns HTTP 500 with `{"error":{"code":"debug_error_trigger",…}}`.

**3. Confirm in Cloud Logging**

Open Logs Explorer → verify `ERROR` entries with `message: "request failed"`,
`request_id` present, and **no** `authorization`, `token`, `password`, or DSN
values in any field (redaction check, S2):

```
resource.type="cloud_run_revision"
resource.labels.service_name="khiimori-api"
severity>=ERROR
jsonPayload.path="/debug/trigger-error"
```

**4. Confirm the metric spikes (S3)**

Open the **"Khiimori API — Request Metrics"** dashboard → the **5xx error rate**
panel should show a visible spike during the drill window.

**5. Confirm the alert fires (S4)**

After ~3–4 minutes of sustained errors, Cloud Monitoring fires the
`Khiimori API — 5xx error rate elevated` policy. You should receive an email at
`goncalo.mestre1998@gmail.com` with a link to the incident.

Note the timing: from first error → alert email received. Expected latency:
3 min (alert duration) + ~1 min (evaluation + notification delivery) ≈ **4–5 min**.

**6. Disable the trigger**

Remove `DEBUG_ERROR_TRIGGER` from the Cloud Run env:

```bash
gcloud run services update khiimori-api \
  --region europe-west2 \
  --project intricate-reef-424222-d6 \
  --remove-env-vars DEBUG_ERROR_TRIGGER
```

Or revert the IaC change + push to main.

**7. Acknowledge / close the incident**

In Cloud Monitoring → Alerting → Incidents, acknowledge the test incident and
close it once the error rate returns to zero.

### Expected outcomes

| Check | Expected |
|---|---|
| `GET /debug/trigger-error` | HTTP 500, `code: "debug_error_trigger"` |
| Cloud Logging | `ERROR` entries, `request_id` present, no secrets in any field |
| 5xx dashboard panel | Visible spike during drill window |
| Alert email received | ~4–5 min after drill start |
| Email content | Incident link, no PII or secrets in payload |
| After disabling trigger | `GET /debug/trigger-error` → HTTP 404 |
