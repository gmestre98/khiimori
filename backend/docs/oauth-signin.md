# Google OAuth sign-in

Google SSO is the only authentication method in v1 (PRD §5.8). The backend runs
the OAuth 2.0 / OpenID Connect **authorization-code flow**: it builds the Google
consent URL, handles the redirect callback, exchanges the code for tokens, and
verifies the ID token to obtain a trustworthy identity. Google is wrapped behind
an internal `IdentityProvider` interface so it can be swapped without touching
callers (PRD §7.0).

Implemented across [Epic M02.1](../../docs/khiimori-v1/milestones/M02-auth-and-profile/epic-01-google-oauth-signin/README.md)
(see that README for the acceptance criteria and story breakdown).

**Library:** [`golang.org/x/oauth2`](https://pkg.go.dev/golang.org/x/oauth2) for
the authorization-code flow and [`github.com/coreos/go-oidc/v3`](https://pkg.go.dev/github.com/coreos/go-oidc/v3/oidc)
for JWKS-backed ID-token verification (confirmed with the author in S1).

## Author prerequisites (one-time, per environment)

In the [Google Cloud console](https://console.cloud.google.com/apis/credentials)
→ **APIs & Services → Credentials → Create credentials → OAuth client ID**:

1. Application type: **Web application**.
2. **Authorized redirect URIs** — add the exact callback URL for each environment
   (must match byte-for-byte; a trailing-slash or scheme mismatch is the most
   common OAuth misconfiguration):
   - dev: `http://localhost:8080/auth/callback`
   - prod: `https://<cloud-run-url>/auth/callback`
3. Note the generated **client ID** (non-secret) and **client secret** (secret).

## Configuration

The app reads three environment variables (see
[`internal/platform/config`](../internal/platform/config/config.go)). They are
optional at startup — the service boots without them; the sign-in endpoints
return **503** until all three are set.

| Env var | Secret? | Source in production | Local dev |
|---|---|---|---|
| `OAUTH_CLIENT_ID` | no | Pulumi config `khiimori:oauthClientId` → Cloud Run env | `.env` |
| `OAUTH_REDIRECT_URI` | no | Pulumi config `khiimori:oauthRedirectUri` → Cloud Run env | `.env` |
| `OAUTH_CLIENT_SECRET` | **yes** | **Secret Manager** (`khiimori-oauth-client-secret`) mounted into Cloud Run | `.env` |

Set the production values (see [infra/README](../../infra/README.md)):

```sh
pulumi config set        khiimori:oauthClientId    "<client-id>.apps.googleusercontent.com"
pulumi config set        khiimori:oauthRedirectUri "https://<cloud-run-url>/auth/callback"
pulumi config set --secret khiimori:oauthClientSecret "<client-secret>"
```

The client **secret** lives only in Secret Manager and is injected as an env var
at runtime — never hardcoded, committed, or sent to the client (PRD §6, §8.5).
Locally, copy `.env.example` to `.env` and fill the three values.

## The flow

```
Browser            Backend (auth module)                 Google
   │  GET /auth/login   │                                   │
   ├───────────────────▶│  mint state + nonce               │
   │                    │  set signed state cookie          │
   │   302 ─────────────┤  build consent URL                │
   │◀───────────────────┤                                   │
   │  redirect to consent ──────────────────────────────────▶│
   │                    │                          user consents
   │  GET /auth/callback?code&state ◀────── 302 ─────────────┤
   ├───────────────────▶│  verify state vs. cookie (CSRF)   │
   │                    │  exchange code ──────────────────▶│
   │                    │  verify ID token (sig/aud/iss/exp/nonce)
   │                    │  → VerifiedIdentity               │
   │                    │  → provisioning (Epic 02)         │
   │                    │  → session issuance (Epic 03)     │
```

1. **`GET /auth/login`** — mints a cryptographically random `state` (CSRF) and
   `nonce` (OIDC replay guard), stores both in a short-lived, HMAC-signed cookie
   (`HttpOnly`, `SameSite=Lax` so it survives the callback navigation, `Secure`
   in production), and redirects to Google's consent screen. The cookie is
   stateless by design — no server-side store — so it works across Cloud Run
   instances and survives scale-to-zero.
2. **Google consent** — the user authenticates and consents (or declines).
3. **`GET /auth/callback`** — verifies the returned `state` against the cookie
   (rejects a mismatch as CSRF), exchanges the `code` for tokens, and verifies
   the ID token's **signature** (Google JWKS), **audience**, **issuer**,
   **expiry**, and **nonce** before trusting it. Any failure returns an auth
   error with no session or user created.
4. **Verified identity** — on success a `VerifiedIdentity` (`google_sub`,
   `email`, `name`, `avatar`) is handed to user provisioning (Epic 02), which
   creates or resolves the `auth.users` row keyed on `google_sub`
   (idempotently). Session issuance (Epic 03) is not wired yet, so the callback
   still returns a placeholder acknowledgement once provisioning succeeds. See
   [admin-bootstrap.md](admin-bootstrap.md) for how the designated user becomes
   an admin during provisioning.

## Security notes

- **Secrets:** the OAuth client secret lives only in Secret Manager; the client
  ID and redirect URI are non-secret config.
- **No logging of sensitive values:** authorization codes, access/ID tokens, and
  raw claims are never logged. The shared logger redacts secret-named fields
  (M01.7), the access log records the request path (not the query string), and
  the callback logs only a failure reason — never the code or tokens.
- **CSRF + replay:** the `state` parameter (cookie-bound) guards against CSRF;
  the OIDC `nonce` (checked against the ID token claim) guards against replay.
- **Exact redirect URI:** the configured redirect URI must match the Google
  console registration exactly.
