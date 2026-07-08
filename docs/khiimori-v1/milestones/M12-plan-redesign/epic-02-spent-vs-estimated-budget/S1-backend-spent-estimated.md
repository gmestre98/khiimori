# S1 — Backend: roll-up splits spent vs. estimated

> Epic: [M12.2 Spent vs. estimated budget](README.md) · AC1.

## Goal

Make the budget roll-up count a cost as **spent** only when the underlying thing
happened, and surface not-yet-happened costs as a separate **estimated** total.

## Scope

- **`ExternalCost`** (`rollup.go`) gains a `Happened bool`. The composition-root
  cost reader sets it; the budget module never learns *why* something happened.
- **`RollupResult`** gains `EstimatedTripTotal`, `EstimatedByCategory`,
  `EstimatedByDay` (JSON `estimated_*`). The existing `trip_total` / `by_category`
  / `by_day` / `by_day_category` now mean **spent only**.
- **`computeRollup`** buckets each external cost by `Happened` (spent vs.
  estimated); **manual cost entries are always spent** (logged after the fact).
- **Cost reader** (`cmd/api/main.go`, `tripCostReaderAdapter`):
  - Plan items: `WHERE status NOT IN ('skipped','cancelled')`; `Happened = status
    == 'done'`. So done → spent, idea/planned → estimated, skipped/cancelled →
    excluded.
  - Stays: `Happened = true` for now (a `paid` flag arrives in S2), so stay
    behaviour is unchanged by this story.

Stays without dates, category mapping, and planned budget lines are untouched.

## Acceptance

- [x] A done plan item's cost is spent; an idea/planned item's cost is estimated;
      a skipped/cancelled item's cost is neither.
- [x] Manual cost entries always count as spent.
- [x] `estimated_trip_total` / `estimated_by_category` / `estimated_by_day`
      returned on the roll-up; `by_day` excludes trip-level (stay) costs as before.
- [x] Unit test for the spent/estimated split + an integration test proving a
      status change moves a cost between the buckets.
