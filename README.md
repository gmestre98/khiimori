# Eudaimonia — Travel Manager

A personal travel-management app to plan, budget, navigate, and journal trips —
a better replacement for the spreadsheet I use today.

> **Status:** early development. The product is defined and the repository
> scaffolding is in place (monorepo layout, Go backend skeleton, web app,
> tooling, one-command local dev). Product features come next.

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

## Local development

### Prerequisites

- **Go** 1.23+ — backend ([go.dev/dl](https://go.dev/dl/)).
- **Node.js** 20+ (developed on 24) and **npm** — web app and dev scripts ([nodejs.org](https://nodejs.org/)).
- **golangci-lint** 1.64+ — Go linting ([golangci-lint.run](https://golangci-lint.run/welcome/install/)). Only needed to run `make lint`-style checks; not required to run the app.

### From clone to running

```sh
git clone https://github.com/gmestre98/Eudaimonia.git
cd Eudaimonia
make install      # install web dependencies (Go deps are fetched on first build)
make dev          # start backend + web together
```

`make dev` is the **one command** for local dev. It preflights prerequisites and
ports, starts the Go backend (`:8080`) and the Vite web app (`:5173`), verifies
the web host can reach the backend, and stops both on `Ctrl-C`. If a prerequisite
is missing or a port is busy it fails with a clear, actionable message. Override
ports with `PORT=...` / `WEB_PORT=...`. Run `make help` to list all targets.

> The backend currently listens but speaks no protocol yet — the HTTP server and
> health endpoints arrive in Epic M01.2. `make dev` only checks reachability.

### Per-language commands

**Backend** (run from `backend/`, see [`backend/README.md`](backend/README.md)):

```sh
go build ./...            # compile
go test ./...             # test (includes the module-boundary check)
golangci-lint run ./...   # lint
gofmt -l .                # format check (empty = clean); gofmt -w . to apply
```

**Web** (run from `web/`, see [`web/README.md`](web/README.md)):

```sh
npm run build         # type-check + production build
npm run lint          # ESLint
npm run format:check  # Prettier check (npm run format to apply)
```

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
