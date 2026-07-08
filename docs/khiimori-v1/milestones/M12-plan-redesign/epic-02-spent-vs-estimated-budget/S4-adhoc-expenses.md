# S4 — Ad-hoc expenses on the Budget tab

> Epic: [M12.2 Spent vs. estimated budget](README.md) · AC4.

## Goal

Let a traveller log a cost that isn't tied to any activity — street food, water,
a souvenir — straight from the Budget tab, attached to the whole trip or an
optional day.

## Scope

- **Backend** (`cost_entry_handlers.go`, `module.go`): `GET
  /trips/{tripID}/cost-entries` returns the trip's manual cost entries
  (`{ "entries": [...] }`), read-authz gated. The store's `ListCostEntries`
  already existed (the roll-up uses it); this exposes it so the list persists and
  can be edited. Create/update/delete were already present.
- **Wire** (`api.ts`): `listCostEntries(tripId)`; `cacheKeys.costEntries`.
- **UI** (`TripExpenses.tsx`): an "Expenses" card on the Budget tab with a
  "+ Log expense" form (category, amount, note, optional day picker → "Whole trip
  (no day)" by default) and a list with per-row edit/delete. Manual expenses
  always count as **spent** (logged after paying). Offline-safe via the mutation
  queue, cache-then-revalidate for instant render.
- **Page** (`TripBudgetPage.tsx`): loads the entries + builds the day picker from
  the trip's days (id + date, from the shared per-day cache), refreshes the
  roll-up after each change.
- **Dev mock**: lists/echoes cost entries so the flow works in preview.

## Acceptance

- [x] A cost can be logged from the Budget tab with no activity link, defaulting
      to the whole trip; a day can optionally be picked.
- [x] Logged expenses persist (GET endpoint) and can be edited/deleted; the
      roll-up updates.
- [x] Manual expenses count as spent, not estimated.
- [x] Backend handler tests (list success + denied read) and UI tests (label
      whole-trip vs day, log trip-level, pin to a day, delete); verified in a
      browser.
