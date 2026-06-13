# Runbook — Deploy the app shell & verify the round-trip (M01.6 S4)

This runbook records how the web app shell reaches Firebase Hosting and how to
verify the end-to-end round-trip: the **deployed** web app calling the
**deployed** API's `/healthz` cross-origin (epic AC1 + AC2). Deployment is fully
through the **pipeline** ([`.github/workflows/ci.yml`](../../../../../.github/workflows/ci.yml)) —
never a manual `firebase deploy` from a laptop.

## How a deploy happens (no manual steps)

A push to `main` runs the pipeline. The relevant jobs:

| Job | What it does |
| --- | --- |
| `web` | Lint, format, **build** (`tsc -b` + `vite build`), and **test** (Vitest) — gate. |
| `deploy-web` | On `main`: rebuilds the bundle with `VITE_API_BASE_URL` injected, authenticates to GCP via WIF (keyless), and `firebase deploy --only hosting` to the M01.4 site. |
| `deploy` | Builds/pushes the API image and rolls a Cloud Run revision to it (only the image — env/secrets/scaling are Pulumi-owned). |
| `e2e` | Smoke-checks the deployed env (`e2e/smoke.sh`): API `/readyz` + web shell load. |

The Hosting target is fixed in [`firebase.json`](../../../../../firebase.json) (the
M01.4 IaC-managed site); the SPA rewrite serves `index.html` for all routes.

### Required GitHub repo variables (author-provided)

The pipeline is config-driven — set these as **repository variables** (not code):

| Variable | Used for |
| --- | --- |
| `API_BASE_URL` | Injected as `VITE_API_BASE_URL` at web build time **and** as the e2e API target. Must be the Cloud Run service URL (`cloudRunUrl` stack output). |
| `WEB_BASE_URL` | The e2e web target — the Firebase Hosting URL (`firebaseHostingUrl` stack output). |
| `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_AR_REPO` | GCP project / region / Artifact Registry repo. |
| `GCP_WIF_PROVIDER`, `GCP_DEPLOYER_SA` | Keyless WIF auth (M01.5 S5). |

> The web build **fails loudly** if `API_BASE_URL` is empty, rather than shipping
> a bundle with a blank API base URL (a silent prod misconfig). See the
> `deploy-web` job's build step.

### CORS prerequisite (S3)

The deployed API must allow the Hosting origin. `infra/cloudRun.ts` sets
`CORS_ALLOWED_ORIGINS` from the Firebase Hosting origin by default, so a normal
`pulumi up` wires it. If the web app is served from an additional origin (custom
domain — S5), add it via the `corsAllowedOrigins` stack config and `pulumi up`
(see [`infra/README.md` → CORS](../../../../../infra/README.md)).

## Manual verification checklist

After a `main` deploy completes (both `deploy-web` and `deploy` green):

1. **Load the Hosting URL** (`firebaseHostingUrl`, e.g. `https://<site>.web.app`)
   in a browser. The app shell renders (title *Khiimori* + the health card).
2. **Health card shows `✓ Healthy`** — the deployed app reached the deployed
   API's `/healthz`. It names the API base URL it called (the prod Cloud Run URL,
   not `localhost`), confirming the env-driven base URL (S1) took effect.
3. **No CORS errors in the browser console** (DevTools → Console). The `/healthz`
   request in the Network tab shows `200` with an
   `access-control-allow-origin: <Hosting origin>` response header (S3).
4. **Served via CDN** — the Hosting response carries Firebase's CDN headers
   (e.g. `cache-control` / `x-served-by` style headers from the Hosting edge).
5. **Pipeline, not manual** — confirm the deploy came from the `deploy-web` job
   on the `main` run (Actions tab), not a local `firebase deploy`.

If step 2 shows `✗ Unreachable`: check (a) `API_BASE_URL` repo variable points at
the live Cloud Run URL, (b) the API revision is serving (`/readyz` 200), and
(c) `CORS_ALLOWED_ORIGINS` on the running revision includes the Hosting origin.

## Status

Pipeline path and verification steps are documented here. The **live deploy and
the on-screen confirmation are the author's step** (author-provided GCP project,
WIF, and repo variables); record the outcome against this checklist when run.
