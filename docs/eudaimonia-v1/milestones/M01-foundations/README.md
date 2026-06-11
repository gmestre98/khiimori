# Milestone 01 — Foundations

> The platform every feature is built on: repo, backend skeleton, database, IaC, CI/CD, frontend
> hosting, observability, and cost guardrails. Outcome: an end-to-end "walking skeleton" that
> deploys from a commit and costs ≈€0 at idle.
>
> PRD refs: §6, §7.1, §7.3–7.6, §7.7, §7.8, §8.

---

## Milestone goal

Stand up the full vertical slice — React/TS app on Firebase Hosting → Cloud Run Go service → Neon
Postgres — provisioned by Pulumi and shipped by GitHub Actions, with logs, alerts, and billing
guardrails in place. No product features yet, just the rails so Milestones 02–10 are cheap to build.

## Milestone-level Definition of Done

- A commit to `main` lints, tests, builds, deploys the API to Cloud Run and the web app to Firebase
  Hosting, and the deployed app round-trips a request through every layer.
- One Neon Postgres database exists with **schema-per-module** and migrations in CI.
- Billing budget + alert and Maps API quota caps are live; the idle bill is ≈€0 (PRD §8.5).
- Structured logs and at least one error alert reach the author while abroad.

## Epics in this milestone

| Epic | Title | AC | Cost-relevant |
|------|-------|----|---------------|
| [01](epic-01-repo-scaffolding.md) | Repository & project scaffolding | 5 | — |
| [02](epic-02-backend-service-skeleton.md) | Backend service skeleton & health endpoints | 5 | — |
| [03](epic-03-database-and-migrations.md) | Database & migrations (Neon, schema-per-module) | 5 | yes (Neon) |
| [04](epic-04-infrastructure-as-code.md) | Infrastructure as Code (Pulumi/TS) | 5 | yes (provisions billable infra, €0 idle) |
| [05](epic-05-cicd-pipeline.md) | CI/CD pipeline (GitHub Actions) | 5 | yes (CI minutes) |
| [06](epic-06-frontend-hosting-shell.md) | Frontend hosting & app shell | 5 | — |
| [07](epic-07-observability.md) | Observability (logs, metrics, alerting) | 5 | — |
| [08](epic-08-cost-guardrails.md) | Cost guardrails (billing budget, Maps caps, scale-up levers) | 5 | yes (the cost epic) |

## Sequencing within the milestone

```
01 Repo scaffolding
   ├─ 02 Backend skeleton ──┐
   ├─ 03 Database & migrations ──┤
   04 Infrastructure as Code ◄───┘ (needs something to deploy + a DB to point at)
        └─ 05 CI/CD pipeline
             ├─ 06 Frontend hosting & shell
             └─ 07 Observability
08 Cost guardrails — provisioned with/just after 04 (IaC), verified before any real-trip use
```

## Designs

System architecture reference: [assets/04-architecture.svg](../../assets/04-architecture.svg) (PRD §7).
No product UI in this milestone beyond a health-check page.
