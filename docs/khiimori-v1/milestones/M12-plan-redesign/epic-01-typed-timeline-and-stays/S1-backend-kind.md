# S1 — Backend: plan-item `kind`

> Epic: [M12.1 Typed timeline & single stays](README.md) · AC1.

## Goal

Give every plan item a first-class **`kind`** — `activity` (default), `transport`,
`food`, or `note` — that describes how it behaves while planning, **independent of
its budget category** (the existing `type` field, which keeps feeding budget
roll-ups unchanged).

## Scope

- **Migration** `00024_trip_plan_items_kind.sql`: add `kind text NOT NULL DEFAULT
  'activity'` with a `CHECK` to the four values; backfill existing rows from the
  historical `type`/category label (transport-ish → `transport`, food-ish →
  `food`, everything else → `activity`).
- **Domain** (`plan_item.go`): `Kind` on `PlanItem`, `NewPlanItem`, `EditPlanItem`;
  `normalizePlanItemKind` (nil/blank → `activity`, trimmed + lower-cased) and
  `validatePlanItemKind` (membership only).
- **Store** (`plan_item_store.go`): `kind` in the column list, scan, and the two
  INSERT variants + UPDATE. Promote/demote/move/status leave `kind` untouched.
- **Handlers** (`plan_item_handlers.go`): accept `kind` on create/edit (defaulting
  + validating), return it on every plan-item response.
- **Wire contract** (`web/src/lib/api.ts`): `PlanItemKind` union; `kind` on
  `PlanItem` (required, always returned) and optional on `PlanItemInput`.

Budget mapping is deliberately **not** changed — the composition-root cost reader
still maps `type`, so roll-ups are unaffected.

## Acceptance

- [x] Create/edit accept an optional `kind`; omitted → `activity`; invalid → 400.
- [x] `kind` round-trips through the DB and appears on all plan-item responses.
- [x] Existing rows are backfilled; budget roll-ups unchanged.
- [x] Unit tests (default/accept/reject on create + edit) and a store integration
      test for round-trip + default.
