# Epic M01.3 — Database & Migrations (Neon, schema-per-module)

> Milestone: [01 — Foundations](../README.md) · PRD refs: §7.7, §7.8, §8.6.

## Description

Provision the one Postgres database on Neon, connect to it through the serverless driver/pooler,
and establish schema-per-module migrations so each domain owns its own tables from day one. Wire
the DB readiness check into `/readyz`.

**Estimated effort:** ~3–4 developer-days (one developer).

## Acceptance Criteria

- [ ] A single **Neon Postgres** database (free tier) is provisioned and reachable from the service.
- [ ] The service connects via Neon's **serverless driver / connection pooler**, so scale-to-zero ↔ always-on is a config change, not a code change (PRD §8.6).
- [ ] A migration tool is wired in and creates a **schema per module** (`auth.*` … `geo.*`) (PRD §7.7).
- [ ] `GET /readyz` verifies DB connectivity through the pooled connection.
- [ ] An integration test runs migrations against an ephemeral Neon branch / test DB (PRD §7.6).

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
