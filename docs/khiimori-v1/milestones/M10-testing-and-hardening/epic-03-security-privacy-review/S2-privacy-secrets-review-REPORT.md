# S2 — Privacy, secrets & key review — REPORT

> Deliverable for [S2](S2-privacy-secrets-review.md). Review date: 2026-07-05.
> Combines the automated `/security-review` with a manual pass on privacy,
> secret handling, and Maps key restrictions. **No secret values appear here.**

## 1. Automated pass — `/security-review`

The project's `/security-review` skill was run over the branch. The epic is a
review/audit deliverable with no runtime code changes, so the branch diff is
empty and the skill reports **no findings** by construction. The substantive
automated coverage for the safety-critical areas is the standing test suite,
green in CI:

- `backend/cmd/api/authz_integration_test.go` — cross-module authorization.
- `backend/internal/sharing/*_integration_test.go` — membership/invitation/revocation.
- `e2e/` (M10.2) — role-based access + offline sync probed **across identities**
  against the deployed environment on every `main` push.

## 2. Privacy — trips / photos / journals visible only to owner + invited members

Confirmed at two layers:

- **Server enforcement (code):** every trip-scoped read goes through the
  `MembershipAuthorizer` (`ActionRead` = Owner/Editor/Viewer) before returning
  data — see the [S1 report](S1-authz-coverage-audit-REPORT.md) matrix. Trip
  listing is store-scoped by a membership JOIN, so a user only ever sees trips
  they are a member of. Journal reads (`handleGetEntry`, `handleListPhotos`) and
  budget reads gate on `checkReadAccess`; photo delete/list are additionally
  scoped by `trip_id` in the store (no cross-trip IDOR).
- **Behavioural (staging, across identities):** the M10.2 role-access E2E drives
  Owner, Editor, Viewer, and a **non-member** identity against the deployed API
  and asserts a non-member cannot read another user's trip/day/journal (403/404,
  not data). That suite is green against prod on each `main` push.

**Result:** trips, photos, and journals are visible only to the owner + invited
members. No privacy leak found.

## 3. Secrets — OAuth & Maps keys never reach the client

- **Client bundle scan:** the built web bundle (`web/dist/**`) was scanned for
  key/secret patterns (`AIza…`, `GOCSPX-…`, `client_secret`, `session_secret`,
  `resend`, `sk_live`, `googleapis…key=`). **Nothing found.** The only
  `VITE_`-prefixed value baked into the client is `VITE_USE_MOCK_TRIPS` (a dev
  flag) and `VITE_API_BASE_URL` (a public URL). No API key or secret is shipped.
- **Maps key:** never exposed to the client. All Google Maps/Geocoding/Places
  calls are made **server-side** by the geo proxy (`internal/geo/google.go`,
  `q.Set("key", g.apiKey)` on outbound requests only). `handleStaticMap` returns
  proxied PNG **bytes**, never a redirect to a Google URL carrying the key. The
  key is read from `MAPS_API_KEY` (Secret Manager) at runtime.
- **OAuth / session secrets:** `OAUTH_CLIENT_SECRET` and `SESSION_SECRET` are
  read from env (Secret Manager mounts) and used only server-side. The OAuth
  client **id** is non-secret; the client **secret** stays server-side. Test-login
  (`/auth/test-login`) is registered only when `E2E_LOGIN_SECRET` is set (absent
  in production), and invite-token exposure on the owner-only list is gated on
  the same secret.

## 4. Secrets live only in Secret Manager; service accounts least-privilege

- **Secret Manager (`infra/secrets.ts`):** `database-url`, `database-url-direct`,
  `oauth-client-secret`, `maps-api-key`, `session-secret`, `e2e-login-secret` are
  all provisioned as Secret Manager containers. Values are never committed —
  supplied out-of-band or via Pulumi *secret* config (encrypted in state);
  `session-secret` is minted with `@pulumi/random` and stored encrypted. No
  plaintext secret in git or program output.
- **Least-privilege SA (`infra/serviceAccount.ts`):** the Cloud Run service runs
  as a dedicated identity granted `secretmanager.secretAccessor` on **each
  specific secret** (never project-wide) and `storage.objectUser` on the **single
  media bucket** only. No primitive (Owner/Editor) roles, no exported key file
  (Cloud Run uses the attached identity). The direct-DSN secret is granted only
  to the CI deployer SA, not the runtime SA.

## 5. Maps key restrictions

- **API-target restrictions are enforced via CI** (`.github/workflows/ci.yml`,
  job *"Apply Maps API key restrictions (idempotent)"*): on each `main` push,
  after `pulumi up`, every non-Firebase API key in the project is restricted to
  `maps-backend`, `geocoding-backend`, and `places-backend` only. Idempotent; a
  no-op until a Maps key exists. This supersedes the "one-time manual console
  step" note in `infra/mapsKey.ts` (see F2 below).
- **Hard daily quota cap** is available behind `khiimori:enableMapsQuotaCap`
  (default off) to deny-at-limit (HTTP 429, unbilled) — the documented cost
  guardrail (PRD §8.4/§8.5). Application (referrer/IP) restriction is
  intentionally *None* because the key is never client-exposed and Cloud Run uses
  dynamic egress IPs; the exposure risk it would mitigate does not exist here.

## Findings

- **F2 (low, docs): stale comment in `infra/mapsKey.ts`.** The module header
  still says API key restrictions must be applied *manually* in the console; they
  are now applied idempotently by the CI job. Documentation-only; the restriction
  is enforced. Recorded for S3 (fix-now candidate — trivial comment update).

No release-blocking privacy or secret-exposure findings. F1 (from S1) and F2 are
both low severity.

## Definition of done

✅ Privacy confirmed (owner + invited members only) via code + cross-identity
staging E2E. ✅ OAuth/Maps keys verified absent from client responses/bundle;
secrets live only in Secret Manager; service accounts least-privilege. ✅
`/security-review` run over the branch (no code diff → no findings) plus this
manual pass. ✅ Findings recorded with severity (F2 low), fed to S3.
