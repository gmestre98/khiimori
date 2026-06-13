# Epic M01.3 — Database & Migrations (Neon, schema-per-module)

> **Status:** ✅ Done — all 8 stories implemented and all 5 acceptance criteria verified.
>
> Milestone: [01 — Foundations](../README.md) · PRD refs: §7.7, §7.8, §8.6.

## Description

Provision the one Postgres database on Neon, connect to it through the serverless driver/pooler,
and establish schema-per-module migrations so each domain owns its own tables from day one. Wire
the DB readiness check into `/readyz`.

**Estimated effort:** ~3–4 developer-days (one developer).

## Acceptance Criteria

- [x] A single **Neon Postgres** database (free tier) is provisioned and reachable from the service.
- [x] The service connects via Neon's **serverless driver / connection pooler**, so scale-to-zero ↔ always-on is a config change, not a code change (PRD §8.6).
- [x] A migration tool is wired in and creates a **schema per module** (`auth.*` … `geo.*`) (PRD §7.7).
- [x] `GET /readyz` verifies DB connectivity through the pooled connection.
- [x] An integration test runs migrations against an ephemeral Neon branch / test DB (PRD §7.6).

## Implementation Details / Architecture

- **Schema-per-module** gives logical separation now and lets a module move to its own service/DB
  later without a data redesign (PRD §7.7, §7.0).
- Using the pooler/serverless driver from day one is the PRD's explicit prerequisite for instant
  mid-trip scale-up (PRD §8.6).
- The DB connection string lives only in Secret Manager (provisioned in M01.4).

## Dependencies

- **Upstream:** M01.1 (Go module), M01.2 (service to host `readyz`). Neon account is author-provided.
- **Downstream:** every feature milestone (02–10) stores data here; M01.4 injects the secret; M01.5 runs migrations in CI.

## Costs Impact

The **database is the one component that doesn't scale to zero for free indefinitely** (PRD §8.4 #1).
v1 starts on the **Neon free tier (≈€0)**; the documented scale-up lever is "click Neon → paid tier"
(~€10–18/mo) for reliability mid-trip (PRD §8.6). No paid commitment in this epic.

## Designs

Architecture reference: [assets/04-architecture.svg](../../../assets/04-architecture.svg) (DB layer).

## User stories

The epic is split into **8 small user stories**, each sized **≤4h for one developer**
(implementation + tests + review). Each story file is a standalone agent-ready prompt — hand a
single file to a coding agent and it has enough context (background, task, acceptance criteria,
constraints, dependencies, definition of done) to implement it without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-provision-neon.md) | Provision Neon Postgres database | ~2h | AC1 | — (M01.1) |
| [S2](S2-db-connection-layer.md) | DB connection layer (serverless driver / pooler) | ~3.5h | AC1, AC2 | S1 |
| [S3](S3-migration-tool.md) | Select & wire a migration tool | ~3h | AC3 | S1 |
| [S4](S4-schema-per-module.md) | Schema-per-module layout & initial schemas | ~3h | AC3 | S3 |
| [S5](S5-migration-runner.md) | Migration runner command | ~2.5h | AC3 | S3, S4 |
| [S6](S6-readyz-db-check.md) | Wire DB connectivity into `/readyz` | ~2.5h | AC4 | S2 (M01.2 S8) |
| [S7](S7-migration-integration-test.md) | Integration test: migrations on ephemeral DB | ~3.5h | AC5 | S4, S5 |
| [S8](S8-document-db.md) | Document the database story | ~2h | — | S2–S7 |

**Total:** ~22h (≈ 3 dev-days), consistent with the epic's ~3–4 dev-day estimate.

### Sequencing

```
S1 Provision Neon ─┬─ S2 Connection layer ── S6 /readyz DB check (needs M01.2 S8)
                   └─ S3 Migration tool ── S4 Schemas ── S5 Runner ── S7 Integration test
S8 Document  ◄── needs S2–S7
```

S2 (connection/readiness track) and S3–S5 (migrations track) can proceed in parallel once S1 lands.

## Verification (2026-06-12)

All 8 stories were audited against the code; `go build ./...`, `go vet ./...`, `go test ./...`, and
`gofmt -l` are green, and the migrations + readiness check were exercised live against the Neon dev
database (and a throwaway database for the integration test). Each story shipped as its own reviewed
PR (#98–#105). Where each story landed:

| Story | AC | Implementation | Verification |
|-------|----|----------------|--------------|
| S1 provision Neon | AC1 | Neon free-tier project (`neondb`, region `eu-west-2`, PG 18); pooled + direct endpoints documented in `backend/docs/database.md`; `backend/.env.example` template; secrets as GitHub Actions secrets, never committed | both endpoints reached via `psql`; no secret in the diff |
| S2 connection layer | AC1, AC2 | `internal/platform/db` — `pgx`/`pgxpool` pool from config, `Pinger`/`Close`, Neon-tuned limits; `DB_POOLED` toggle (pooled `DATABASE_URL` / direct `DATABASE_URL_DIRECT`); DB is a hard, fail-fast startup dependency | unit tests for DSN/toggle; live pool ping (pooled + direct); fail-fast paths verified |
| S3 migration tool | AC3 | goose v3 as a library (no extra DB drivers), plain-SQL migrations embedded via `//go:embed`; `cmd/migrate` (`up`/`down`/`status`) on the direct endpoint from config | throwaway migration applied + rolled back on the dev DB; arg-validation unit test |
| S4 schema-per-module | AC3 | six migrations `00001..00006`, one `CREATE SCHEMA` per module (`auth`,`trip`,`budget`,`journal`,`sharing`,`geo`); no cross-schema FKs; conventions documented | up creates exactly the six module schemas; full down removes them; live on dev DB |
| S5 migration runner | AC3 | one-command `make migrate-up/down/reset/status` (loads `.env` or ambient env, targets any `DATABASE_URL_DIRECT`); `reset` subcommand added | full up/down/reset cycle; CI-style (no `.env`) run; non-zero + no-secret on failure |
| S6 `/readyz` DB check | AC4 | `cmd/api` registers a `db` readiness check pinging through the pooled pool, under the M01.2 registry's bounded timeout; `/healthz` unchanged | unit tests (200/`ok`, 503/`failed`, no detail leak, `/healthz` 200); live `/readyz` 200 |
| S7 integration test | AC5 | `migrations/integration_test.go` (build tag `integration`) applies the full set to a dedicated `DATABASE_URL_TEST`, asserts the six module schemas, rolls back; skips if unset | passed against a throwaway Neon database (created/dropped); excluded from default `go test` |
| S8 document DB | — | `backend/docs/database.md` operational hub (pooled vs direct, connecting, migrations, secrets, ephemeral-branch test, scale-up lever → M01.8); `backend/README.md` pointer | all links resolve; build/vet/test/lint green |

> **Known follow-ups (non-blocking):** the service connects as `neondb_owner` rather than a dedicated
> least-privilege app role (SQL documented in `database.md`); CI wiring of the integration test and an
> ephemeral Neon branch is M01.5.
