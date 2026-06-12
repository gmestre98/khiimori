# infra

Infrastructure as code for Eudaimonia — **Pulumi (TypeScript) on GCP**. One
language across infra and scripting (PRD §7.4). This program provisions the
project's cloud resources: Artifact Registry, a private Cloud Storage bucket,
Secret Manager, a least-privilege Cloud Run service (with runtime secrets and
scale-to-zero tunables), and the Firebase Hosting site.

`pulumi up` stands the whole environment up reproducibly from a fresh stack;
`pulumi destroy` tears it down. The runbook is below.

## Layout

| Path                                                       | Purpose                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `Pulumi.yaml`                                              | Pulumi project file (committed).                           |
| `Pulumi.dev.yaml.example`                                  | Template for the `dev` stack config (copy, don't commit).  |
| `index.ts`                                                 | Entrypoint — wires the modules and declares stack outputs. |
| `config.ts`                                                | Typed project/region config surface.                       |
| `services.ts`                                              | GCP API enablement (one place).                            |
| `artifactRegistry.ts`                                      | Docker image repository (S2).                              |
| `storage.ts`                                               | Private media bucket (S3).                                 |
| `secrets.ts`                                               | Secret Manager containers (S4).                            |
| `serviceAccount.ts`                                        | Least-privilege Cloud Run SA + IAM (S5).                   |
| `cloudRun.ts`                                              | Cloud Run service + runtime secrets + scaling (S6/S7/S9).  |
| `hosting.ts`                                               | Firebase Hosting site (S8).                                |
| `tunables.ts`                                              | Scale tunables / cost levers (S9).                         |
| `tsconfig.json` / `eslint.config.mjs` / `.prettierrc.json` | TS toolchain, matching `web/`.                             |

## Prerequisites

These are the **author-provided** inputs `pulumi up` assumes — nothing else
needs manual setup; API enablement and resource ordering are handled by IaC.

- **Node.js 20+** and **npm** (same toolchain as `web/` and `scripts/`).
- **[Pulumi CLI](https://www.pulumi.com/docs/install/)** ≥ 3.x.
- **[gcloud CLI](https://cloud.google.com/sdk/docs/install)** with Application
  Default Credentials: `gcloud auth application-default login`. The GCP provider
  uses ADC — **no service-account key files** are committed or generated.
- A **GCP project with billing enabled** (PRD §8.3). Billing must be on even
  within free allowances; all resources here are scale-to-zero / free-tier so
  idle cost is ≈€0 (PRD §8.1, §8.8).
- **Firebase enabled on that GCP project** (one-time) for the Hosting site —
  `firebase projects:addfirebase <project>` or the Firebase console. The program
  manages the Hosting _site_; enabling Firebase itself is the manual step.
- **Secret values** for the three Secret Manager secrets (DB URL, OAuth client
  secret, Maps key) — supplied securely at provision time (see step 3 below).

## State backend

State lives in **Pulumi Cloud (free for individuals)** — the simplest durable
option for a solo project, with secret config encrypted at rest by Pulumi. Log
in once before working on the stack:

```sh
pulumi login          # uses app.pulumi.com (set PULUMI_ACCESS_TOKEN in CI)
```

Alternatives (not used here): a self-managed **GCS backend**
(`pulumi login gs://<bucket>`) keeps state inside your GCP project but the state
bucket must be created out-of-band first; `pulumi login --local` keeps state on
disk (not durable/shareable). Switching backends is a `pulumi login` change, not
a code change.

## Provisioning (`pulumi up`)

From a fresh checkout, with the prerequisites above met:

```sh
# 1. Install the toolchain and create the stack config.
cd infra
npm install
cp Pulumi.dev.yaml.example Pulumi.dev.yaml     # then edit: set gcp:project
pulumi stack init dev                           # if the stack doesn't exist yet

# 2. (region defaults to europe-west2 in the template; adjust if needed.)

# 3. Supply the three secret VALUES — encrypted into the stack, never plaintext
#    in git. The DB URL MUST use the least-privilege Neon role `app_rw`
#    (backend/docs/database.md), not neondb_owner.
pulumi config set --secret eudaimonia:databaseUrl       "postgresql://app_rw:…"
pulumi config set --secret eudaimonia:oauthClientSecret "…"
pulumi config set --secret eudaimonia:mapsApiKey        "…"
#    (Or leave these unset and add versions out-of-band after `up`:
#     gcloud secrets versions add eudaimonia-database-url --data-file=- )

# 4. Preview, then provision.
pulumi preview
pulumi up
```

`pulumi up` enables the required APIs, then creates the Artifact Registry repo,
the bucket, the secrets (+ versions from step 3), the service account and its
least-privilege bindings, the Cloud Run service (running the placeholder image
until M01.5 pushes the real one, reading its secrets at runtime), and the
Firebase Hosting site — in dependency order, no manual fix-ups.

> **Note on the container image:** Cloud Run validates the image exists at deploy
> time. The default `serviceImage` is a public placeholder so a fresh stack
> stands up immediately; CI (M01.5) overrides it with the real S2 image.

## Stack outputs

After `pulumi up`, `pulumi stack output` lists the values downstream milestones
consume (M01.5 CI, M01.6 web shell, M01.7/M01.8):

| Output                   | What it is                                              |
| ------------------------ | ------------------------------------------------------- |
| `gcpProject`/`gcpRegion` | Resolved provider config.                               |
| `artifactImagePrefix`    | Image-path prefix CI pushes to / Cloud Run pulls from.  |
| `mediaBucket`            | Private media bucket name.                              |
| `secrets`                | Secret ids (DB URL, OAuth client secret, Maps key).     |
| `cloudRunServiceAccount` | Least-privilege runtime SA email.                       |
| `cloudRunUrl`            | Cloud Run service URL (M01.6 shell + CORS origin).      |
| `firebaseHostingSiteId`  | Hosting site id (M01.5 deploy target).                  |
| `firebaseHostingUrl`     | Default Hosting origin URL (M01.6 web origin).          |
| `tunables`               | Scale levers: min/max instances, Neon tier, Maps quota. |

(`pulumi stack output secrets` shows only the secret **ids/names** — never the
values.)

## Teardown (`pulumi destroy`)

```sh
cd infra
pulumi destroy
```

Removes everything this stack created. Notes on what is **intentionally
retained** and the one gotcha:

- **Enabled APIs stay enabled.** API resources are created with
  `disableOnDestroy: false`, so a teardown never disables a project-level API
  that other stacks or humans might rely on. Disable them by hand if you truly
  want them off.
- **Firebase remains enabled** on the GCP project — it's an author-provided
  prerequisite this program doesn't own.
- **Non-empty media bucket:** `destroy` will fail if the bucket holds objects
  and `mediaBucketForceDestroy` is false (the safe default). For an ephemeral
  test stack, set `eudaimonia:mediaBucketForceDestroy: true` (or empty the
  bucket first); for a real environment, leave it false and remove objects
  deliberately.

No billable resources are left orphaned after `destroy` (PRD §8) — everything
else (registry, bucket, secrets, SA, Cloud Run, Hosting site) is removed.

## Commands

Run from `infra/`:

```sh
npm run build         # type-check (tsc --noEmit)
npm run lint          # ESLint
npm run format:check  # Prettier check (npm run format to apply)

pulumi preview        # show planned changes
pulumi up             # apply
pulumi destroy        # tear down
pulumi stack output   # list outputs
```
