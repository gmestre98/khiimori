# S5 — Frontend: kind picker + decoupled cost

> Epic: [M12.1 Typed timeline & single stays](README.md) · AC5 · depends on S1, S2.

## Goal

Let the planner pick *what an item is* — activity, transport, food, or note — and
give each kind the fields that fit it, with the **budget category decoupled** from
kind (auto-suggested, freely overridable).

## Scope

- **Kind picker** (`PlanItemForm`): a segmented control of the four kinds with a
  glyph each, always visible above the composer. Selecting a kind drives the
  fields shown and the item's icon.
- **Per-kind fields**:
  - **Transport** — the single Location is replaced by **From → To**, and Start
    time/Duration become **Departure / Arrival** (wiring the S2 origin /
    destination / arrive_time fields).
  - **Note** — a plain reminder: title (+ optional link) only; no location, time,
    cost, or category.
  - **Activity / Food** — unchanged (location, time, duration, cost, booking).
- **Cost decoupled** (`changeKind` + `suggestedCategory`): switching kind
  auto-suggests the budget category (Transport→Transport, Food→Food,
  Activity→Activities, Note→none) **only** when the category is still empty or the
  previous kind's default — a manual override is preserved. Rollups still key off
  the `type`/category field, untouched.

## Acceptance

- [x] Add/edit shows a kind picker (default Activity); each kind reveals its own
      fields; transport shows from→to + departure/arrival.
- [x] Budget category is auto-suggested from kind yet overridable; a note has no
      category.
- [x] Component tests (picker default, transport from/to + auto-category on
      create, note is minimal); full web gate green; **verified in-browser**
      (kind picker, transport fields, auto-suggested "Transport" category).
