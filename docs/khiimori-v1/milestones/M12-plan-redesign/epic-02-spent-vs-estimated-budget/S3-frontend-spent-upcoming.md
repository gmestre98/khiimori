# S3 — Frontend: Spent + Upcoming display; stay paid toggle

> Epic: [M12.2 Spent vs. estimated budget](README.md) · AC3.

## Goal

Surface the S1/S2 split in the UI: show **Spent** alongside an **Upcoming**
(estimated) total, and let the traveller mark a stay **paid**.

## Scope

- **Wire types** (`api.ts`): optional `estimated_trip_total` /
  `estimated_by_category` / `estimated_by_day` on `BudgetRollup`; `paid?: boolean`
  on `Stay` and `StayInput` (optional so a cache written before M12.2 still parses).
- **Budget display** (`RollupDisplay.tsx`):
  - `BudgetSummaryTiles`: a "+€X upcoming" sub-line under Spent when there's an
    estimate.
  - `CategoryMeter` / `TripRollup`: a per-category "· +€X upcoming" hint; a
    category with only an estimate still renders.
  - `DayRollup`: a day-level "+€X upcoming (not yet done)" line.
- **Stay form + card** (`StaySlot.tsx`): a "Paid" checkbox in the form; on a stay
  with a cost, a Paid/Upcoming badge and an inline **Mark paid / Mark unpaid**
  toggle (a full-replacement edit reusing the stay's fields). Hidden when the stay
  has no cost.
- **Styles** (`App.css`): paid badge, paid checkbox row, upcoming hints.
- **Dev mock** (`dev-mock.ts`): estimated roll-up fields, an unpaid costed stay,
  capitalized category keys (matching the real backend), and stay writes now echo
  the request body so the paid toggle reflects in the preview.

## Acceptance

- [x] Budget shows Spent and a separate Upcoming estimate at trip, category, and
      day level.
- [x] A stay with a cost shows Paid/Upcoming and toggles inline; the toggle is
      hidden when the stay has no cost.
- [x] Rollups/stays cached before M12.2 (missing the new fields) still render.
- [x] Unit tests for the upcoming display and the paid toggle; verified in a
      browser (budget tiles + by-category upcoming; stay Upcoming → Paid).
