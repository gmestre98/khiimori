# Epic M12.2 — Spent vs. estimated budget & ad-hoc expenses

> Milestone: [12 — Plan redesign](../README.md) · PRD refs: §5.4, §9, §7.0.

## Description

The budget roll-up treated every cost the same: a stay's cost, a plan item's cost,
and a manually-logged cost all landed in one "spent" total the moment they existed —
even for an item that was only an *idea* and might never happen. That makes the
"Spent" number a plan estimate, not a record of real spending.

This epic separates the two ideas a traveller actually has:

- **Spent** — money on things that *happened*: a plan item marked **done**, a stay
  marked **paid**, and every manually-logged cost (you log those after you pay).
- **Upcoming (estimated)** — money a plan might still cost: idea/planned items and
  unpaid stays. Shown separately so it never masquerades as spend.
- A **skipped/cancelled** item drops out of the budget entirely — it costs nothing.

It also lets a traveller log **ad-hoc expenses that aren't tied to any activity**
(street food, water, a souvenir) straight from the Budget tab, optionally pinned to
a day.

| Story | Title | Status |
|-------|-------|--------|
| [S1](S1-backend-spent-estimated.md) | Backend: roll-up splits spent vs. estimated | ⬜ |
| [S2](S2-backend-stay-paid.md) | Backend: stays get a `paid` flag | ⬜ |
| [S3](S3-frontend-spent-upcoming.md) | Frontend: Spent + Upcoming display; stay paid toggle | ⬜ |
| [S4](S4-adhoc-expenses.md) | Ad-hoc expenses on the Budget tab | ⬜ |

## Conventions

Inherits all milestone-wide conventions (EUR currency, server-side authorization,
modular monolith with schema-per-module, €0-idle cost posture, no new runtime
dependencies — PRD §7.0).
