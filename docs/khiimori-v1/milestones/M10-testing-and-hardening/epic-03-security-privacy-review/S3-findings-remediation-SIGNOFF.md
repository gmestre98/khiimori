# S3 — Findings remediation & sign-off

> Deliverable for [S3](S3-findings-remediation.md). Sign-off date: 2026-07-05.
> Release gate for the M10.3 security & privacy review.

## Findings triage

| ID | Source | Severity | Description | Release-blocking? | Decision |
|----|--------|----------|-------------|-------------------|----------|
| F1 | [S1](S1-authz-coverage-audit-REPORT.md) | Low (info) | `403` vs `404` on authz denial differs: Trip/Budget/Journal return `404` (hide existence); Sharing management returns `403`. | No | **Accept as designed.** Sharing endpoints are member-facing; the `403` message is intentional UX and trip ids are unguessable UUIDv4, so existence disclosure is negligible. No fix. Revisit only if a non-member-facing route is added to sharing. |
| F2 | [S2](S2-privacy-secrets-review-REPORT.md) | Low (docs) | `infra/mapsKey.ts` header said API key restrictions must be applied *manually*; they are now CI-enforced (idempotent). | No | **Fixed now** — comment updated to describe the CI job; no behaviour change. |

No release-blocking findings (auth bypass, key/secret exposure, privacy leak)
were identified in S1 or S2.

## Remediation & re-verification

- **F2 — fixed.** Updated the stale comment in `infra/mapsKey.ts` to point at the
  CI "Apply Maps API key restrictions" job. Re-verified: `infra` typecheck / lint
  / format pass in CI on this PR; the restriction behaviour is unchanged (it was
  already enforced by CI — only the doc was stale).
- **F1 — accepted, no change.** Re-verified the underlying enforcement is sound:
  every trip-scoped endpoint still gates on the `Authorizer` before touching data
  (S1 matrix), so F1 is purely a status-code-convention nuance, not a data leak.

## Re-verification of the gate (existing regression guards, all green)

- `backend/cmd/api/authz_integration_test.go` — cross-module authorization.
- `backend/internal/sharing/*_integration_test.go` — membership/invite/revocation.
- M10.2 role-access + offline-sync E2E (`e2e/`) — probes Owner/Editor/Viewer/
  non-member across identities against the deployed environment on each `main`
  push.
- Web bundle scan (S2) — no client-side keys/secrets.

## Sign-off

✅ **Security & privacy gate met for v1.** All findings triaged; the two low
findings (F1 accepted-as-designed, F2 fixed) carry a recorded decision. **No open
release-blockers.** Authorization is enforced on every trip-scoped endpoint,
trips/photos/journals are visible only to owner + invited members, and no
OAuth/Maps secret reaches the client (secrets in Secret Manager, least-privilege
service accounts).

_Signed off by: engineering (M10.3), 2026-07-05._
