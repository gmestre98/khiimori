# S1 — Structured logs flow to Cloud Logging

> **Status:** ✅ Done — `slog` ReplaceAttr maps `msg`→`message` / `level`→`severity` for Cloud Logging; `X-Cloud-Trace-Context` parsed for trace correlation; Logs Explorer query documented in the runbook ([#143](https://github.com/gmestre98/khiimori/pull/143)).

## Context
Problems must be visible, especially when the author is abroad (PRD §6). The service already emits
**structured JSON logs** from the `platform` layer (M01.2 S2); on Cloud Run, stdout JSON is ingested by
**Cloud Logging** automatically. This story makes that ingestion correct and useful: severity mapping and
trace/request correlation so logs are filterable.

Assumes the structured logger (M01.2 S2) and a deployed service (M01.5) exist.

## Task
Ensure the service's structured JSON logs land in Cloud Logging with correct severity and request correlation.

## Acceptance criteria
- [x] Deployed service logs appear in **Cloud Logging** as structured entries (fields queryable, not opaque text).
- [x] The logger's level maps to Cloud Logging **severity** (so error entries are classified as `ERROR`).
- [x] Each log entry carries the **request id** (M01.2 S5) and, where available, the Cloud Run trace/correlation field.
- [x] A documented Logs Explorer query finds all errors for a given request id.
- [x] Consistent with the project policy that only **error-level** logs are emitted for now (M01.2 S2).

## Constraints
- Don't add a logging agent/sidecar — rely on Cloud Run's native stdout→Cloud Logging path (PRD §7.0, §8.1).
- Keep within the free log allowance (50 GB/mo — PRD §8.1).

## Definition of done
A triggered error on the deployed service shows in Cloud Logging as an `ERROR` entry with its request id.

## Dependencies
M01.2 S2 (structured logging), M01.5 (deployed service). Precedes S2 (redaction) and S4 (alerting).
