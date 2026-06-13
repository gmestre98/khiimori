# S1 — Cost posture review (idle ≈€0–3/mo, guardrails live)

## Context
A light **load/cost review** confirms the expected **≈€0–3/mo idle** posture, **scale-to-zero** for the
stateless services, and that **Maps caps + billing budget/alert are active** (PRD §8.4–8.6). This is a
checklist against PRD §8.

## Task
Review and confirm the project's idle cost posture and live guardrails.

## Acceptance criteria
- [ ] A checklist confirms the **≈€0–3/mo idle** posture (Cloud Run scale-to-zero, Neon free tier,
  Firebase free tier, Maps within free allowance).
- [ ] **Scale-to-zero** is confirmed for the stateless services (no min-instances by default).
- [ ] **Maps key restricted with hard quota caps** and **GCP billing budget + alert** are verified
  **live** (from Milestone 01).
- [ ] The DB is the one component that doesn't scale to zero for free — confirmed on the **Neon free
  tier** with the documented paid-tier lever (PRD §8.4 #1).

## Constraints
- This is a **verification** checklist against PRD §8 — confirm live settings, don't add cost.
- Reference Milestone 01's cost-guardrails epic (budget/alert, Maps caps) rather than re-creating them.

## Definition of done
The idle cost posture and live guardrails (scale-to-zero, Maps caps, billing alert) are confirmed against
PRD §8.

## Dependencies
Milestone 01 Epic 08 (guardrails), Milestone 07 (Maps), Milestone 03 (Neon). Scale-up in S2.
