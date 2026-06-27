# S1 — Responsive layout system

## Context
The app is **genuinely responsive** — a comfortable laptop layout and a **purpose-built mobile layout**,
not a scaled-down desktop (PRD §5.10). One codebase serves both (PRD §7.2). This story builds the
responsive layout system.

## Task
Implement the responsive layout system (breakpoints + laptop/mobile layout structure) on the component
library.

## Acceptance criteria
- [x] A breakpoint system distinguishes **laptop** and **mobile** layouts (and any tablet midpoint).
- [x] A comfortable **laptop layout** and a distinct **mobile layout** exist — the mobile layout is
  purpose-built, not a shrunk desktop.
- [x] Layouts compose Epic 02 components and adapt without bespoke per-screen layout code.
- [x] The system aligns with Milestone 03's trip/day shell so feature screens slot in.

## Constraints
- One codebase, responsive (PRD §7.2) — no separate mobile app.
- Build on Epic 02 primitives; don't re-implement components.

## Definition of done
A responsive layout system provides distinct laptop and mobile layouts that feature screens compose into.

## Dependencies
Epic 02 (components), Milestone 03 (shell). Mobile nav in S2.
