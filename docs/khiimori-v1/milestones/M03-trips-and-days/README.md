# Milestone 03 — Trips & Days

> The structural backbone of the product: trip CRUD, auto-generated days mapped to real dates, the
> Current/Upcoming/Past trips menu, and the trip shell that Planning (04), Budgets (05), Journal
> (06), and Maps (07) all hang off.
>
> PRD refs: §5.1, §9 (Trip, Day, TripMembership), §7.1 (Trip/Itinerary module).

---

## Milestone goal

Deliver trips and the days within them. A traveller can create, edit, archive, and delete a trip
(name, destinations, start/end date, cover, EUR base currency). Each trip **auto-generates one Day
per date** in its range, and days map to real calendar dates. Trips are grouped automatically into
**Current / Upcoming / Past** from dates vs. today, with the **current trip surfaced prominently**
as the day-to-day driver while travelling. The trip owner is recorded as a `TripMembership` with
role `Owner` at creation, and **all trip reads/writes are authorized server-side** — wired through
the auth hook from Milestone 02 (an owner-only shim until Milestone 08's full Sharing module lands).

## Milestone-level Definition of Done

- **Create / edit / archive / delete** a trip works; archive hides without deleting, delete cascades
  days/owned entities transactionally (PRD §5.1, §7.7).
- On create or date change, the trip **auto-generates exactly one `Day` per date** in
  `[start_date, end_date]`; shrinking removes out-of-range days (guarded if they hold data),
  extending adds new ones (PRD §5.1).
- A **Trips menu** groups trips into **Current / Upcoming / Past** derived from dates vs. today, with
  the **current trip surfaced prominently** (today's day number + a budget-glance slot) (PRD §5.1).
- The **owner `TripMembership`** row is created at trip creation, and every trip read/write is
  **authorized server-side** via the auth hook (PRD §5.9, §6).
- Days are **deep-linkable** (trip → day) to support Planning/Journal/Maps, and unit + integration
  tests cover day generation on range edits and bucketing edge cases (PRD §7.6).

## Epics in this milestone

| Epic | Title | AC | Est. (dev-days) | Cost-relevant |
|------|-------|----|-----------------|---------------|
| [01](epic-01-trip-model-crud/README.md) | Trip data model & CRUD (`trip.*`, owner membership) | 5 | ~2–3 | — |
| [02](epic-02-day-generation/README.md) | Automatic day generation on range edits | 4 | ~2 | — |
| [03](epic-03-bucketing-listing/README.md) | Trip bucketing & listing (Current/Upcoming/Past) | 4 | ~1–2 | — |
| [04](epic-04-authorization-integration/README.md) | Server-side authorization integration | 4 | ~1–2 | — |
| [05](epic-05-dashboard-trip-shell/README.md) | Trips dashboard & trip shell (frontend) | 5 | ~2–3 | — |
| | **Milestone total** | **22** | **~8–12** (≈ 2–2.5 weeks, one developer) | |

> **Estimates** assume one developer familiar with the stack; they cover implementation, tests, and
> review. Epics 02–04 can largely proceed in parallel once the trip model (Epic 01) lands.

## Sequencing within the milestone

```
01 Trip model & CRUD ─┬─ 02 Day generation ──┐
                      ├─ 03 Bucketing & listing ──┤
                      └─ 04 Authorization integration ──┤
                                                        └─ 05 Trips dashboard & trip shell
```

## Designs

- Trips dashboard (Current/Upcoming/Past): [assets/01-trips-dashboard.svg](../../assets/01-trips-dashboard.svg) (PRD §4.1).
- Day-within-trip context: [assets/02-day-plan-map.svg](../../assets/02-day-plan-map.svg) (PRD §4.2).
- Mobile trip context: [assets/03-mobile-and-sharing.svg](../../assets/03-mobile-and-sharing.svg) (PRD §4.3).
