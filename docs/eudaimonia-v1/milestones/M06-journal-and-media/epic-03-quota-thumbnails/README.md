# Epic M06.3 — Storage quota (1 GB/trip) & server-side thumbnails

> Milestone: [06 — Journal & Media](../README.md) · PRD refs: §5.5, §8.1, §8.4, §8.6, §11.4.

## Description

The storage-cost epic. **Enforce a 1 GB-per-trip photo cap server-side** on upload (rejecting
uploads beyond the cap with a clear message), **track and expose per-trip usage** so the UI can warn
as the cap approaches, and **generate server-side resized/thumbnail variants** so list/grid views
load light versions, not full-resolution originals. These are the PRD's two named storage-cost
mitigations: a predictable cap and reduced egress.

**Estimated effort:** ~2–3 developer-days (one developer).

## Acceptance Criteria

- [ ] **Per-trip photo usage is tracked**, and the **1 GB cap is enforced server-side before
      persisting**: uploads beyond the cap are **rejected with a clear message** (PRD §5.5, §11.4).
- [ ] A **usage figure per trip** is exposed for the UI to display and **warn as the cap approaches**
      (PRD §5.5).
- [ ] **Server-side resized/thumbnail variants** are generated on upload so list/grid views serve
      light versions, mitigating photo egress (PRD §5.5, §8.4 #3).
- [ ] Thumbnailing is done **inline** unless a measured need for async appears (no Pub/Sub until
      justified, PRD §7.0, §7.8).
- [ ] Unit + integration tests cover cap enforcement (under/at/over), usage accounting on
      add/delete, and thumbnail generation (PRD §7.6).

## Implementation Details / Architecture

- Wraps the upload path from Epic 02: **validate → enforce per-trip 1 GB quota → store original
  (`MediaStore`) → generate resized/thumbnail variants** (PRD §5.5, §7.8).
- Usage is tracked per trip (summing stored bytes) and checked server-side before persisting, so the
  cap can't be bypassed by a client — it is a **cost guardrail**, not a UI nicety (PRD §8.4).
- Deleting a photo decrements usage so the cap reflects reality.
- The scale-up lever, if photo volume grows, is "raise storage / add async thumbnailing" — no
  redesign (PRD §8.6).

## Dependencies

- **Upstream:** Epic 02 (upload path + `MediaStore`), Milestone 01 (Cloud Storage bucket, billing
  budget/alert).
- **Downstream:** Epic 04 (usage/warn UI), Milestone 10 (cost review verifies the cap).

## Costs Impact

This is the **main storage-cost epic** (PRD §8.1, §8.4):

- **Photos → Cloud Storage**, expected **€0–1/mo** at a few GB; the **1 GB-per-trip cap** keeps cost
  **predictable** (PRD §5.5, §11.4).
- **Photo egress is a named cost risk** (PRD §8.4 #3) — mitigated by **server-side thumbnails** so
  large originals aren't repeatedly transferred.

## Designs

Per-trip usage indicator and light photo grids:
[assets/03-mobile-and-sharing.svg](../../../assets/03-mobile-and-sharing.svg) (PRD §4.3, §5.10).
