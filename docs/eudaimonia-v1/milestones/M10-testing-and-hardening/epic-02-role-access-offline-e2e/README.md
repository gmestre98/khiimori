# Epic M10.2 — Role-based access & offline-sync E2E

> Milestone: [10 — Testing & Hardening](../README.md) · PRD refs: §5.9, §6, §7.6.

## Description

Extend the E2E harness (Epic 01) to exercise the two cross-cutting guarantees that span the whole
app: **role-based access** (an Editor can edit, a Viewer is read-only, a non-member is denied) and
**offline → online sync** for journal and plan edits. These prove the server-side authorization
guarantee (Milestone 08) and the shared offline mechanism (Milestones 04/06/09) work end-to-end, not
just in unit tests.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] E2E covers **role-based access**: an **Editor edits**, a **Viewer is read-only**, and a
      **non-member is denied** — exercising the server-side authorization guarantee (PRD §5.9, §6,
      Milestone 08).
- [ ] E2E covers **offline → online sync** for **journal and plan edits**: changes made offline queue
      and reconcile on reconnect with no loss/duplication (PRD §6, Milestones 04/06).
- [ ] Both suites run in the **staging CI stage** alongside the critical journey (Epic 01) (PRD §7.5).
- [ ] Tests assert server-side enforcement (unauthorized actions yield `403`/`404`, not data), not
      just hidden UI (PRD §5.9).

## Implementation Details / Architecture

- Builds on Epic 01's harness and staging environment; adds multi-identity scenarios (owner + invited
  Editor + Viewer + non-member) using test identities.
- Offline scenarios drive the PWA's service worker / write queue (Milestone 09 + Milestones 04/06) —
  go offline, mutate, reconnect, assert sync.
- Authorization assertions hit the API directly where useful to confirm enforcement is server-side
  (the UI hiding a control is not sufficient evidence).

## Dependencies

- **Upstream:** Epic 01 (harness/staging), Milestone 08 (roles/authorization), Milestones 04/06/09
  (offline queue + PWA shell).
- **Downstream:** feeds the release gate (Epics 03–05 reference these results).

## Costs Impact

Adds to **CI minutes** (PRD §8.4 #4) — watched against the free cap; no standing infra cost beyond
the shared staging environment (~€0 idle).

## Designs

No new UI — validates access and offline behaviour across existing screens (PRD §4, §5.9, §6).

## User stories

The epic is split into **3 small user stories**, each sized **≤4h for one developer** (implementation +
tests + review). Each story file is a standalone agent-ready prompt with enough context to implement it
without reading the rest of the docs.

| # | Story | Est. | Epic AC | Depends on |
|---|-------|------|---------|-----------|
| [S1](S1-role-access-e2e.md) | Role-based access E2E | ~3.5h | AC1, AC4 | Epic 01, M08 |
| [S2](S2-offline-sync-e2e.md) | Offline → online sync E2E | ~3.5h | AC2 | Epic 01, M04/M06/M09 |
| [S3](S3-ci-integration.md) | CI integration of role & offline suites | ~2.5h | AC3 | S1, S2, Epic 01 S3 |

**Total:** ~9.5h (≈ 2 dev-days), consistent with the epic's ~2 dev-day estimate.

### Sequencing

```
S1 Role-based access E2E ──┐
S2 Offline-sync E2E ───────┴─ S3 CI integration
```
