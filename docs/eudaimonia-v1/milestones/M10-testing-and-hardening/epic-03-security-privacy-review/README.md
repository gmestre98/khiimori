# Epic M10.3 — Security & privacy review

> Milestone: [10 — Testing & Hardening](../README.md) · PRD refs: §5.9, §6, §8.5.

## Description

Run a focused **security & privacy review** of v1. Confirm **authorization on every trip-scoped
endpoint** (no endpoint trusts the client), that trips/photos/journals are **visible only to owner +
invited members**, and that **OAuth and Maps secrets never reach the client** (secrets only in Secret
Manager, least-privilege service accounts). Uses the project's `/security-review` over the branch
plus a manual pass on authorization, secret handling, and key restrictions.

**Estimated effort:** ~2 developer-days (one developer).

## Acceptance Criteria

- [ ] **Authorization** is verified on **every** trip-scoped endpoint — no endpoint trusts the client;
      unauthorized requests yield `403`/`404` (PRD §5.9, §6).
- [ ] **Privacy:** trips, photos, and journals are confirmed **visible only to owner + invited
      members** (PRD §6).
- [ ] **Secrets:** OAuth and **Maps keys never reach the client**; secrets live **only in Secret
      Manager**; service accounts are **least-privilege** (PRD §6, §8.5).
- [ ] The review runs the project's **`/security-review`** over the branch plus a **manual pass** on
      authz, secret handling, and key restrictions, with findings recorded and resolved (PRD §6).

## Implementation Details / Architecture

- **Security review** combines the automated `/security-review` skill over the branch with a manual
  audit focused on the safety-critical areas: the `Authorizer` chokepoint (Milestone 08), the Geo
  proxy key handling (Milestone 07), and OAuth/session secrets (Milestone 02) (PRD §6, §8.5).
- Authorization coverage is cross-checked against the endpoint inventory so **every** trip-scoped
  route is accounted for — the PRD treats this as safety-critical (PRD §7.7).
- Privacy checks confirm the Sharing module's enforcement holds for media/journal reads, not just
  trip metadata.

## Dependencies

- **Upstream:** Milestone 08 (authorization authority), Milestone 07 (Maps key protection),
  Milestone 02 (OAuth/session secrets), Milestone 06 (photo/journal privacy), Epic 01 (staging to
  probe).
- **Downstream:** a release gate — findings must be resolved before v1 ships.

## Costs Impact

Verifies the **secret/key posture** that prevents surprise bills (Maps key restriction, no
client-side keys) rather than adding cost (PRD §8.5). Negligible direct cost.

## Designs

No UI — a review/audit deliverable (PRD §6, §8.5).
