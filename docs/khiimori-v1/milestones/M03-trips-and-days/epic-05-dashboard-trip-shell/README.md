# Epic M03.5 — Trips dashboard & trip shell (frontend)

> Milestone: [03 — Trips & Days](../README.md) · PRD refs: §5.1, §5.10, §7.2.

## Description

Build the navigation spine in the web app: a **Trips dashboard** showing **Current / Upcoming /
Past** with the **current trip surfaced prominently** (today's day number and a budget-glance slot),
a **trip create/edit form**, and a **trip shell** that hosts the per-day surfaces delivered by later
milestones. This is the UI every feature milestone renders inside.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [x] A **Trips dashboard** renders the **Current / Upcoming / Past** buckets from Epic 03, with the
      **current trip surfaced prominently** showing **today's day number** and a **budget-glance
      slot** (figures provided later by Milestone 05; this epic renders the slot) (PRD §5.1).
      _(Done: S1 #221, S2 #223)_
- [x] A **trip create/edit form** drives Epic 01's CRUD (name, destinations, start/end date, cover,
      EUR shown as fixed) with archive/delete affordances (PRD §5.1).
      _(S3 #226, S4 #229)_
- [ ] A **trip shell** hosts a per-day view that is **deep-linkable** (trip → day) and provides the
      mounting points the Planning/Budget/Journal/Maps milestones fill in (PRD §5.1).
- [x] The UI only shows trips the user is **authorized** to see (driven by Epic 03/04 server-side
      scoping — the client never decides authorization) (PRD §5.9).
      _(Server-side scoped from Epic 03/04; client renders what server returns)_
- [ ] Surfaces are **responsive** (laptop + mobile) using basic styling now and Milestone 09
      components when available (PRD §5.10, §7.2).

## Implementation Details / Architecture

- Part of the **`/web` React + TypeScript** app (PRD §7.2), rendered inside the authenticated, gated
  app shell from Milestone 02.
- The current-trip surface and budget-glance slot are **placeholders for Milestone 05's figures** —
  this epic owns the layout slot, not the budget math (clean module boundary, PRD §7.1).
- The trip shell defines stable routes/mount points so Milestones 04–07 add day surfaces without
  restructuring navigation.

## Dependencies

- **Upstream:** Milestone 02 (auth context, gated app), Epic 01 (trip CRUD API), Epic 02 (days),
  Epic 03 (bucketed listing).
- **Downstream:** Milestones 04–07 render inside the trip/day shell; Milestone 05 fills the budget
  glance; Milestone 09 restyles these surfaces.

## Costs Impact

Negligible — static assets served from Firebase Hosting free tier (PRD §8.1).

## Designs

- Trips dashboard: [assets/01-trips-dashboard.svg](../../../assets/01-trips-dashboard.svg) (PRD §4.1).
- Day plan shell: [assets/02-day-plan-map.svg](../../../assets/02-day-plan-map.svg) (PRD §4.2).
- Mobile trip context: [assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3).

## User stories

The epic is split into **5 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-trips-dashboard.md) | Trips dashboard (Current/Upcoming/Past) | ~3h | AC1, AC4 | M02, Epic 03 S2 |
| [S2](S2-current-trip-budget-glance-slot.md) | Current-trip prominence & budget-glance slot | ~2.5h | AC1 | S1, Epics 02/03 |
| [S3](S3-trip-create-edit-form.md) | Trip create/edit form | ~3h | AC2 | S1, Epic 01 |
| [S4](S4-archive-delete-affordances.md) | Archive & delete affordances | ~2h | AC2 | S1, S3, Epic 01 S4 |
| [S5](S5-trip-shell-day-mount.md) | Trip shell & deep-linkable day mount points | ~3.5h | AC3, AC5 | Epic 02 S4 |

**Total:** ~14h (≈ 2–3 dev-days), consistent with the epic's ~2–3 dev-day estimate.

### Sequencing

```
S1 Dashboard ──┬─ S2 Current-trip & budget slot
               ├─ S3 Create/edit form ── S4 Archive/delete affordances
               └─ S5 Trip shell & day mount points
```
