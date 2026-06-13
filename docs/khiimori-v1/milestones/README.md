# Khiimori v1 — Milestone & Epic Breakdown

This folder breaks the [v1 PRD](../PRD.md) into **milestones** and **epics**.

- A **milestone** is a coherent, shippable slice of the product (Auth, Trips, Budgets…). Each
  milestone has its own folder with a `README.md` overview and a milestone-level Definition of Done.
- An **epic** is a small, single-responsibility unit of work inside a milestone, with **≤5
  acceptance criteria**, sized to be picked up and shipped on its own.

Each epic contains: **Description · Acceptance Criteria · Implementation Details/Architecture ·
Dependencies · Costs Impact (when relevant) · Designs (when relevant)**.

The breakdown follows the seeds in PRD §12 and respects the **guiding principle** (PRD §7.0):
keep the stack small, prefer a modular monolith, and keep every decision easy to reverse.

## Milestones

| # | Milestone | Theme | Status | Key PRD refs |
|---|-----------|-------|--------|--------------|
| [01](M01-foundations/README.md) | Foundations | Repo, backend, DB, IaC, CI/CD, hosting, observability, cost guardrails | **Broken into 8 epics** | §7.1, §7.4–7.8, §8 |
| [02](M02-auth-and-profile/README.md) | Auth & Profile | Google SSO, user provisioning, profile | **Broken into 5 epics** | §5.7, §5.8, §7.1 |
| [03](M03-trips-and-days/README.md) | Trips & Days | Trip CRUD, Current/Upcoming/Past, auto-generated days | **Broken into 5 epics** | §5.1, §9 |
| [04](M04-organic-day-planning/README.md) | Organic Day Planning | Stays, plan items, ideas backlog, re-planning | **Broken into 6 epics** | §5.2, §5.3, §9 |
| [05](M05-budgets-and-cost-tracking/README.md) | Budgets & Cost Tracking | Trip/day budgets, costs, roll-ups | **Broken into 4 epics** | §5.4, §9 |
| [06](M06-journal-and-media/README.md) | Journal & Media | Journal entries, photos, offline, 1 GB/trip cap | **Broken into 4 epics** | §5.5, §6, §9 |
| [07](M07-maps/README.md) | Maps | Geo proxy, per-day map, key/cost protection | **Broken into 4 epics** | §5.6, §8.4–8.5 |
| [08](M08-sharing-and-backoffice/README.md) | Sharing & Backoffice | Memberships, invitations, roles, admin | **Broken into 5 epics** | §3, §5.9, §9 |
| [09](M09-design-system-and-mobile-pwa/README.md) | Design System & Mobile/PWA | Theme, responsive, installable, a11y | **Broken into 5 epics** | §5.10, §7.2 |
| [10](M10-testing-and-hardening/README.md) | Testing & Hardening | E2E journeys, load/cost review, security review | **Broken into 5 epics** | §6, §7.6, §8.5 |

> **Status legend:** All milestones (01–10) are now broken into ≤5-AC epics, each as a folder with a
> `README.md` (Description · Acceptance Criteria · Implementation Details · Dependencies · Costs ·
> Designs). Per-epic user-story breakdowns (≤4h agent-ready stories) are added in follow-up PRs —
> complete for Milestone 01, in progress for 02–10.

## Recommended sequencing (milestone level)

```
M01 Foundations
   └─ M02 Auth & Profile
        └─ M03 Trips & Days
             ├─ M04 Organic Day Planning ─┐
             ├─ M05 Budgets & Cost Tracking ├─ (parallelisable once M03 lands)
             ├─ M06 Journal & Media        │
             ├─ M07 Maps                   │
             └─ M08 Sharing & Backoffice ──┘
M09 Design System & Mobile/PWA — runs alongside M03–M08 (foundation early, polish late)
M10 Testing & Hardening — continuous; gating before release
```

## Conventions used across milestones

- **Currency:** all money is **EUR** in v1 (PRD §5.4, §9, §11.5).
- **Authorization:** every trip-scoped request is checked server-side by the Sharing/Access
  module (PRD §5.9, §6) — the UI never decides authorization on its own.
- **Architecture default:** modular monolith in Go with clean module boundaries, one Postgres
  database with **schema-per-module** (PRD §7.1, §7.7).
- **Cost posture:** scale-to-zero by default, single-setting scale-up (PRD §8.6).
