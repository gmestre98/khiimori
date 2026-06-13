# Runbook — Attach a custom domain to Firebase Hosting (M01.6 S5)

How to point an **author-provided** custom domain at the Firebase Hosting site
(the M01.4 site that serves the web app shell). This is an optional, one-time
operational step — **v1 functions fully on the default `*.web.app` Hosting URL**
without it (epic AC5).

> **Cost & ownership.** The domain is **author-provided** (~€1/mo, ≈€10–15/yr —
> PRD §8.3); it is the only fixed cost in this stack and is **not required** for
> v1 to work. Everything else stays within the Firebase free tier (PRD §8.1).

## IaC or manual?

**Manual (documented), not IaC.** The Pulumi `@pulumi/gcp` provider has no
Firebase Hosting *custom-domain* resource, so the site itself is IaC-managed
([`infra/hosting.ts`](../../../../../infra/hosting.ts), M01.4 S8) but the domain
attachment is a one-time manual step in the Firebase console (or the Hosting
REST API). Do it once per domain; it does not need repeating on each deploy.

## Steps

1. **Add the domain** — Firebase console → Hosting → your site → **Add custom
   domain** → enter the domain (e.g. `app.example.com` or the apex
   `example.com`). Firebase shows the records to create.
2. **Verify ownership** — add the **`TXT`** record Firebase gives you at your DNS
   provider, then continue once it propagates. (Ownership verification.)
3. **Point DNS at Hosting** — add the records Firebase specifies:
   - A **subdomain** (`app.example.com`) typically uses a **`CNAME`** (or the
     `A`/`AAAA` records Firebase provides).
   - An **apex/root** (`example.com`) cannot use `CNAME`; use the **`A`** (and
     `AAAA`) records Firebase lists (two A records).
4. **TLS certificate** — Firebase **auto-provisions and renews a managed TLS
   certificate** once DNS resolves. No manual cert handling; provisioning can
   take from minutes up to ~24h while DNS propagates.

## Update app config when the domain changes

The web app and API are origin-aware, so attaching (or changing) a domain
requires two config updates — **otherwise the app or its API calls break**:

1. **API base URL (S1)** — only if the **API** also moves to a custom domain.
   The web app's API base is the build-time `VITE_API_BASE_URL` /
   `API_BASE_URL` repo variable (it is *not* the web domain). Update it only if
   the Cloud Run API gets its own domain. The web domain alone does not touch it.
2. **CORS allowed origins (S3)** — **required** whenever the web app is served
   from a new origin. Add the new origin to the API's allowlist via the
   `corsAllowedOrigins` stack config and `pulumi up`, or the browser will block
   the `/healthz` (and every future API) call from the new domain:

   ```sh
   pulumi config set khiimori:corsAllowedOrigins \
     "https://app.example.com,https://<site>.web.app"
   pulumi up
   ```

   (See [`infra/README.md` → CORS](../../../../../infra/README.md). The default
   `*.web.app` origin keeps working unless you drop it from the list.)

## Verify

1. **DNS resolves** — `dig app.example.com` returns the Firebase records;
   propagation is complete.
2. **HTTPS is valid** — `https://app.example.com` loads with a valid certificate
   (no browser warning); the managed cert provisioned.
3. **App loads & is healthy** — the app shell renders and the health card shows
   `✓ Healthy` (the API call succeeded from the new origin — confirms the S3
   CORS origin was updated). No CORS errors in the browser console.

See also the deploy/round-trip checklist in
[`deploy-and-verify-runbook.md`](deploy-and-verify-runbook.md).

## Status

Documented runbook only — no domain is purchased and no DNS is changed here. A
reader can attach an author-provided domain from this doc and knows exactly
which config (CORS, and optionally the API base URL) to update.
