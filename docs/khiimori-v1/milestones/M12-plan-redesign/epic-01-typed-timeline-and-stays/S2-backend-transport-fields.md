# S2 — Backend: transport origin / destination / arrival

> Epic: [M12.1 Typed timeline & single stays](README.md) · AC2 · depends on S1.

## Goal

Transport legs behave differently from the rest of the itinerary: a leg has an
**origin**, a **destination**, and (often) an **arrival time** distinct from its
departure. The single `location` + `start_time` shape can't express
"Lisbon → Porto, 08:15–09:10". Add the three fields end-to-end.

## Scope

- **Migration** `00025_trip_plan_items_transport.sql`: add nullable `origin text`,
  `destination text`, `arrive_time time`. Generic columns — **not** coupled to
  `kind` at the DB level (the UI surfaces them only for `transport`, S5), keeping
  storage simple and avoiding surprising rejections if an item's kind changes.
- **Domain** (`plan_item.go`): `Origin`, `Destination`, `ArriveTime` on `PlanItem`,
  `NewPlanItem`, `EditPlanItem`; `validateTransportFields` (origin/destination reuse
  the location length bound; `arrive_time` must be HH:MM). Deliberately **no**
  ordering constraint between `arrive_time` and `start_time` (overnight legs) and
  `arrive_time` does **not** require `start_time` (arrival-only legs are valid).
- **Store** (`plan_item_store.go`): the three columns in the column list, scan,
  both INSERT variants (+ the upsert `DO UPDATE` set), and the UPDATE — with
  careful `$N` placeholder alignment.
- **Handlers**: accept + validate the fields on create/edit, return them.
- **Wire contract** + **edit round-trip** (`api.ts`, `DayView.tsx`): `origin`,
  `destination`, `arrive_time` on `PlanItem`/`PlanItemInput`, and carried through
  `PlanItemFormFields` as passthrough so an edit doesn't wipe them (the transport
  input UI lands in S5). Same round-trip guard proven for `kind` in S1.

## Acceptance

- [x] Create/edit accept and return `origin`, `destination`, `arrive_time`; a
      malformed `arrive_time` is 400; `arrive_time` without `start_time` is allowed.
- [x] The three fields round-trip through the DB.
- [x] Editing a transport item preserves the fields (regression test).
- [x] Unit + integration + a DayView round-trip test; full backend + web gates green.
