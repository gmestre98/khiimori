# infra

Infrastructure as code for Eudaimonia — **Pulumi (TypeScript) on GCP**. One
language across infra and scripting (PRD §7.4). This program provisions the
project's cloud resources (Artifact Registry, Cloud Storage, Secret Manager, a
least-privilege Cloud Run service, and the Firebase Hosting site) as they are
added across epic M01.4.

> **Status:** scaffold (S1). The GCP provider is wired via stack config and the
> program declares **no billable resources yet** — `pulumi preview` is clean.
> Resource stories (S2–S9) and the full up/teardown runbook (S10) come next.

## Layout

| Path                                                       | Purpose                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `Pulumi.yaml`                                              | Pulumi project file (committed).                                             |
| `Pulumi.dev.yaml.example`                                  | Template for the `dev` stack config. Copy to `Pulumi.dev.yaml` (gitignored). |
| `index.ts`                                                 | Program entrypoint — declares the resources.                                 |
| `config.ts`                                                | Typed stack-config surface (project, region; tunables later).                |
| `tsconfig.json` / `eslint.config.mjs` / `.prettierrc.json` | TS toolchain, matching `web/`.                                               |

## Prerequisites

- **Node.js 20+** and **npm** (same toolchain as `web/` and `scripts/`).
- **[Pulumi CLI](https://www.pulumi.com/docs/install/)** ≥ 3.x.
- **[gcloud CLI](https://cloud.google.com/sdk/docs/install)** with Application
  Default Credentials: `gcloud auth application-default login`. The GCP provider
  uses ADC — **no service-account key files** are committed or generated.
- A **GCP project with billing enabled** (PRD §8.3) — author-provided. Billing
  must be on even within free allowances; all resources here are
  scale-to-zero / free-tier so idle cost is ≈€0 (PRD §8.1, §8.8).
- **Firebase enabled on that GCP project** (author-provided, one-time) for the
  Hosting site — `firebase projects:addfirebase <project>` or the Firebase
  console. The program manages the Hosting _site_; enabling Firebase itself is
  the manual prerequisite.

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

## Setup

```sh
cd infra
npm install                                  # install Pulumi + TS toolchain
cp Pulumi.dev.yaml.example Pulumi.dev.yaml    # then edit: set gcp:project
# gcp:region defaults to europe-west2 in the template; adjust if needed.
```

`Pulumi.dev.yaml` is **gitignored** (it may hold Pulumi-encrypted secret
config), so it never reaches git — `Pulumi.dev.yaml.example` is the committed
reference for the config surface. Project id and region are **not hardcoded**;
they come from this file (read natively by the GCP provider).

If the `dev` stack doesn't exist yet, create it: `pulumi stack init dev`.

## Commands

Run from `infra/`:

```sh
npm run build         # type-check (tsc --noEmit)
npm run lint          # ESLint
npm run format:check  # Prettier check (npm run format to apply)

pulumi preview        # show planned changes (clean / no resources at S1)
pulumi up             # apply (resource stories onward)
```
