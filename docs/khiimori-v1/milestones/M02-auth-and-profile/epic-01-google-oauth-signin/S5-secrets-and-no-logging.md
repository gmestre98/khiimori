# S5 — OAuth secrets via Secret Manager & no-logging guarantee

## Context
The OAuth **client secret** and any signing material must live **only in Secret Manager** and be injected
via config — never hardcoded — and tokens/codes must **never be logged** (PRD §6, §8.5). M01.4 provisions
Secret Manager and M01.2 provides the config loader and structured logging with redaction (M01.2 S2 /
M01.7 S2).

## Task
Wire the OAuth client secret from Secret Manager into the provider config and ensure auth flows never log
sensitive values.

## Acceptance criteria
- [ ] The OAuth client secret is read from config sourced from **Secret Manager**, not hardcoded or
  committed.
- [ ] The provider/handlers use the secret only at runtime; it never appears in logs, error messages, or
  responses.
- [ ] Codes, access/ID tokens, and raw claims are excluded from logs (rely on / extend the existing
  redaction from observability).
- [ ] A test or static check asserts that the sensitive fields are redacted/omitted from log output for
  the auth flow.

## Constraints
- Reuse the existing Secret Manager injection (M01.4) and redaction (M01.7) — do not invent a parallel
  mechanism (PRD §7.0).
- Local dev may use a `.env`/local secret, but the production source is Secret Manager.

## Definition of done
The OAuth secret is injected from Secret Manager and no sensitive value is logged; the redaction check is
green.

## Dependencies
S1–S3, M01.4 (Secret Manager), M01.2 S2 / M01.7 S2 (logging/redaction). Satisfies epic AC4.
