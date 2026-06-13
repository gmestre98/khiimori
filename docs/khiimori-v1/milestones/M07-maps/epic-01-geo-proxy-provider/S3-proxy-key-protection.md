# S3 — Backend proxy & restricted-key protection

## Context
**All Maps calls go through the backend proxy**; the **restricted Maps API key lives only in Secret
Manager and is never shipped to the client** (PRD §5.6, §6, §8.5). This is the project's biggest cost-risk
mitigation.

## Task
Implement the proxy endpoints that broker Maps operations server-side, holding the key only in the
backend.

## Acceptance criteria
- [ ] The `geo` module exposes proxy endpoints (geocode, route hints, and any map-data brokering) that the
  client calls — the client never calls Google directly.
- [ ] The **restricted Maps API key** is loaded from **Secret Manager** (M01.4) and used only server-side;
  it never appears in client-visible responses, logs, or errors.
- [ ] The proxy enforces that no privileged key is embedded in anything returned to the client.
- [ ] The proxy relies on the key being **restricted** with **quota caps + billing alert** from Milestone
  01 (referenced, not re-created here).

## Constraints
- Key only in Secret Manager + backend memory; reuse M01.7 redaction so it never logs (PRD §8.5).
- This story is the security spine — treat key exposure as a release-blocking defect (verified in S5 and
  Milestone 10).

## Definition of done
Maps operations are brokered by the backend proxy with the restricted key held only server-side.

## Dependencies
S1, S2, M01.4 (Secret Manager), Milestone 01 Epic 08 (Maps caps/billing). Client brokering in S4.
