# S2 — Secret & token redaction in logs

> **Status:** ✅ Done — `slog` ReplaceAttr redacts sensitive keys (authorization, token, password, cookie, dsn, …) before any log write; access log records path only (no headers/query); unit tests + runbook guideline ([#144](https://github.com/gmestre98/khiimori/pull/144)).

## Context
Logs must **exclude secrets and tokens** (PRD §6, §8.5) — a leaked credential in Cloud Logging is a real
breach, and the author can't babysit logs while travelling. This story makes redaction a property of the
shared logger so no module can accidentally log a secret.

Assumes the structured logger (M01.2 S2) and logs flowing to Cloud Logging (**S1**) exist.

## Task
Add redaction to the `platform` logger so secrets/tokens never reach the logs.

## Acceptance criteria
- [x] Known sensitive fields (e.g. `authorization`, `token`, `password`, `db_url`, `api_key`, `cookie`) are
  **redacted/omitted** by the shared logger before output.
- [x] Request/response logging (M01.2 S5) never logs auth headers, cookies, or secret query params.
- [x] A guideline is documented: secrets are passed as typed values, never interpolated into log messages.
- [x] **Unit tests** assert that logging a struct/map containing sensitive keys produces redacted output.
- [x] Verified: connection strings / OAuth tokens do not appear in Cloud Logging for a normal request + an error.

## Constraints
- **Standard library only** for the logger (`log/slog`) — implement redaction with a handler/ReplaceAttr, no new dependency (project rule; ask first if needed).
- Fail safe: when unsure, omit rather than log.

## Definition of done
Unit tests prove sensitive keys are redacted, and no secret/token appears in Cloud Logging during verification.

## Dependencies
M01.2 S2/S5 (logger + middleware), S1 (logs in Cloud Logging). Satisfies epic AC4.
