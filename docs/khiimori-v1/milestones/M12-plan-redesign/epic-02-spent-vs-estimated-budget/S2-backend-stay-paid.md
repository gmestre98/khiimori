# S2 — Backend: stays get a `paid` flag

> Epic: [M12.2 Spent vs. estimated budget](README.md) · AC2.

## Goal

Give a stay a **`paid`** flag so the roll-up can tell a booking that's actually
been paid apart from one that's still just planned — the stay counterpart of a
plan item's done vs. planned distinction (S1).

## Scope

- **Migration** `00026_trip_stays_paid.sql`: add `paid boolean NOT NULL DEFAULT
  false`. Existing stays start as estimates until the traveller confirms payment.
- **Domain** (`stay.go`): `Paid bool` on `Stay`, `NewStay`, `EditStay`.
- **Store** (`stay_store.go`): `paid` in `stayColumns`, scan, both INSERT variants
  (incl. the upsert `ON CONFLICT … SET paid = EXCLUDED.paid`), and UPDATE.
- **Handlers** (`stay_handlers.go`): accept `paid` on create/edit, return it on
  every stay response (single-stay and embedded day response reuse
  `newStayResponse`).
- **Cost reader** (`cmd/api/main.go`): stays now select `paid`; `Happened = paid`
  so an unpaid stay is estimated, a paid one is spent.

## Acceptance

- [x] `paid` round-trips through create/edit and appears on every stay response.
- [x] An unpaid stay's cost lands in the estimated bucket; a paid stay's cost is
      spent; neither touches `by_day` (stays are trip-level).
- [x] Unit test (create round-trip) + integration test (paid → unpaid moves the
      cost between spent and estimated).
