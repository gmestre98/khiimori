# Eudaimonia — Travel Manager

A personal travel-management app to plan, budget, navigate, and journal trips —
a better replacement for the spreadsheet I use today.

> **Status:** pre-development. The product is defined; implementation has not started.

## What it does (v1 scope)

- See your **current**, **upcoming**, and **past** trips.
- Plan each day **organically** — loose ideas or precise schedules — and re-plan
  effortlessly mid-trip.
- Define **where you stay** and **what activities/tours** you take per day.
- Set **budgets** and **track costs** against them (transport, food, activities, stays, other).
- Keep a fast **daily journal** (offline-capable).
- See each day's plan on a **map**.
- **Share trips** with companions via Google sign-in, with role-based access and a small admin backoffice.

## Repository layout

This is a **monorepo** — backend, web, infra, and tooling live together so changes
that span them stay in one place and one history.

| Path | Purpose |
|------|---------|
| [`backend/`](backend/) | Go modular monolith (microservice-ready). |
| [`web/`](web/) | React + TypeScript (Vite) web app / PWA. |
| [`infra/`](infra/) | Infrastructure as code (TypeScript / Pulumi on GCP). |
| [`scripts/`](scripts/) | Repository tooling and dev scripts (TypeScript). |
| [`.github/workflows/`](.github/workflows/) | CI/CD (GitHub Actions). |
| [`docs/`](docs/) | Product requirements and milestone/epic/story planning. |

## Documentation

The full Product Requirements Document and delivery plan live in
[`docs/eudaimonia-v1/`](docs/eudaimonia-v1/):

- **[Eudaimonia v1 PRD](docs/eudaimonia-v1/PRD.md)** — product scope, architecture
  decisions, cost estimates, and the run-at-€0 scaling plan.

Each PRD gets its own folder under `docs/`; epics will be added as sub-folders,
with one file per story.

## Planned stack

- **Backend:** Go (modular monolith, microservice-ready), PostgreSQL (Neon, free tier to start)
- **Frontend:** React + TypeScript (responsive web + installable PWA)
- **Infra & scripting:** TypeScript (Pulumi) on GCP — Cloud Run, Firebase Hosting
- **CI/CD:** GitHub Actions
- **Auth:** Google SSO

See the [PRD](docs/eudaimonia-v1/PRD.md) for the reasoning behind each choice.
