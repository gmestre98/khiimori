# Milestone 10 — Testing & Hardening

**Status:** Milestone overview — to be split into focused epics (≤5 acceptance criteria each) following the [Milestone 01](../M01-foundations/README.md) pattern. The criteria below are the milestone-level spec and the source material for that split.

> End-to-end critical-journey tests, a load/cost review, and a security review — the quality gate
> that makes v1 dependable while travelling abroad.
>
> PRD refs: §6 (all NFRs), §7.5–7.6, §8.4–8.6.

---

## Description

Bring v1 up to a **shippable, dependable** bar. The PRD requires **unit, integration, and
end-to-end tests** across services and frontend (PRD §7.6); unit/integration tests are built
*within* each feature epic, while this epic owns the **cross-cutting end-to-end journeys**, the
**non-functional verification** (availability, performance, offline, security, privacy,
observability), and a **load/cost review** before the author depends on the app mid-trip. It is
**continuous** (runs alongside all epics) but also a **release gate**.

## Acceptance Criteria

**End-to-end journeys (PRD §7.6):**
- [ ] The **critical journey** runs green in CI: **sign in → create trip → plan a day → add budget
      → write journal → share trip** (PRD §7.6).
- [ ] E2E covers **role-based access**: an Editor can edit, a Viewer is read-only, a non-member is
      denied — exercising the server-side authorization guarantee (PRD §5.9, §6, Epic 08).
- [ ] E2E covers **offline → online sync** for journal and plan edits (PRD §6, Epics 04/06).
- [ ] E2E runs against a **preview/staging environment** in the GitHub Actions pipeline (PRD §7.5).

**Non-functional verification (PRD §6):**
- [ ] **Performance:** day view interactive **< 1.5s on a mid-range phone on 4G**, measured and
      recorded (PRD §6, Epic 09).
- [ ] **Availability/offline:** graceful read-only/offline behaviour verified when the network is
      poor; API availability target ~99.5% understood and monitored (PRD §6).
- [ ] **Observability:** centralised logs, basic metrics, and **error alerting** confirmed to reach
      the author **while abroad** (PRD §6, Epic 01).

**Security & privacy review (PRD §6, §8.5):**
- [ ] **Authorization** verified on **every** trip-scoped endpoint — no endpoint trusts the client
      (PRD §5.9, §6).
- [ ] **Privacy:** trips/photos/journals confirmed visible only to owner + invited members
      (PRD §6).
- [ ] **Secrets:** OAuth and **Maps keys never reach the client**; secrets only in Secret Manager;
      least-privilege service accounts (PRD §6, §8.5).
- [ ] **Maps key restricted** with **hard quota caps**; **GCP billing budget + alert active**
      (PRD §8.5) — verified live.

**Load / cost review (PRD §8):**
- [ ] A light **load/cost review** confirms expected **€0–3/mo idle** posture and that scale-up
      levers (Neon tier, Cloud Run `min-instances`, Maps quota) work as **single settings**
      (PRD §8.6).
- [ ] The **mid-trip scale-up playbook** is validated: dashboards reachable from mobile, scale-up
      effective in minutes with no redeploy/migration (PRD §8.6).
- [ ] **CI minutes** watched against the 2,000-min free cap (or repo kept public) (PRD §8.4 #4).

## Implementation Details / Architecture

- **Test pyramid (PRD §7.6):** unit + integration tests live in their feature epics (01–09); this
  epic owns the **E2E suite** and the **NFR/security/cost reviews**.
- **E2E tooling:** a TypeScript-based runner (e.g. Playwright) driving the deployed web/PWA against
  staging, keeping to the one-language-per-layer principle (PRD §7.0, §7.3).
- **CI integration (PRD §7.5):** E2E runs as the pipeline's staging stage; unit/integration gate
  earlier stages (lint → unit → build → integration → deploy → e2e).
- **Security review** uses the project's `/security-review` over the branch plus a manual pass on
  authorization, secret handling, and key restrictions (PRD §6, §8.5).
- **Cost/load review** is a checklist against PRD §8: confirm scale-to-zero, billing alert, Maps
  caps, and that each scale-up lever is config-only (PRD §8.5–8.6).
- **Data migration note:** the Excel importer is **out of scope for v1** (PRD §10) and not tested
  here.

## Dependencies

- **Upstream:** all feature epics (02–09) — E2E journeys span the whole app; Epic 01 provides the
  CI/CD pipeline, staging environment, and observability/alerting.
- **Downstream:** none — this is the **release gate** for v1.

## Costs Impact

- **CI minutes are the cost to watch** here: heavy E2E runs can exceed the **2,000 free GitHub
  Actions minutes** on a private repo — keep the repo public or watch minutes (PRD §8.4 #4).
- This epic **verifies** the project's cost guardrails rather than adding cost: billing
  budget/alert, Maps quota caps, scale-to-zero posture (PRD §8.5–8.6).
- A **staging/preview environment** runs on the same scale-to-zero services (~€0 idle), so it adds
  negligible standing cost (PRD §8).

## Designs

No new UI. Validates that the implemented screens match the directional concepts (PRD §4) and meet
the accessibility/performance bars of Epic 09 (PRD §5.10, §6).
