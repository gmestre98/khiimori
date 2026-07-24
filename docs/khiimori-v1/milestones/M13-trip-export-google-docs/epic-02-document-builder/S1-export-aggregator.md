# S1 — Export aggregator (`ExportModel`)

> Epic: [M13.2 Trip document builder](README.md) · AC1.

## Goal

Assemble a trip's full content into one in-memory `ExportModel` the renderer can
walk, sourcing data through narrow reader interfaces (no cross-module store
reach-in).

## Scope

- **New module** `internal/export` (own package; schema-less — it only reads).
- **`ExportModel`**: trip header (name, destinations, dates, day count, currency);
  `Days []ExportDay` each with `Stay`, `PlanItems` (planned, clock-ordered),
  `WhatHappened` (done/unplanned, by `actual_order`), `Journal`; and a
  `Budget` rollup (per-category planned/spent + totals, from the M12.2 model).
- **Reader interfaces** defined in `internal/export` and **satisfied at the
  composition root** (`cmd/api`): `tripReader`, `dayReader`, `planItemReader`,
  `stayReader`, `journalReader`, `budgetReader`, `photoLister`. Mirrors how the
  budget cost reader is already wired across modules.
- Deterministic ordering (days by date, timeline by clock then sort_order,
  what-happened by actual_order) so output is stable/testable.
- Authorization is the **caller's** responsibility (Epic 03 endpoint checks trip
  access before building) — the aggregator assumes an authorized trip id.

## Acceptance

- [ ] `BuildExportModel(ctx, tripID)` returns a fully-populated model for a trip
      with days, stays, plan items, what-happened, journal, and budget.
- [ ] Empty aspects degrade cleanly (no stay / no journal / no plan items → empty
      sections, not errors).
- [ ] Unit tests with fake readers assert ordering and section composition.
</content>
