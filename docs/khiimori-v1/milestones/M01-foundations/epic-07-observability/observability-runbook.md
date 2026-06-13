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
`database_url`, `credential`.

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
