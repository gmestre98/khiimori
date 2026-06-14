# S2 — Maps API key restriction + hard quota caps

> **Status:** ✅ Done — `infra/mapsKey.ts`: `gcp.serviceusage.ConsumerQuotaOverride` enforces `mapsDailyQuota` from `tunables.ts` as a hard daily cap on Maps JS API (deny-at-limit, not billed). Key API restrictions are a one-time console step (GCP Console → APIs & Services → Credentials → select key → Edit API restrictions) since `@pulumi/gcp` v9.26.0 does not include the `apikeys` module; the hard cap is fully IaC-managed. Steps documented in `cost-guardrails-runbook.md` (S5).

## Context
The Maps API is the project's #1 named overage/abuse risk — a leaked or uncapped key can run up a bill fast
(PRD §8.4 #2, §8.5). This story restricts the key and sets **hard quota caps** via IaC, protecting the Maps
proxy (built in Milestone 07) **before** it can ever overspend.

Assumes the IaC stack (M01.4) and the Maps key secret (M01.4 S4) exist.

## Task
Restrict the Maps API key and set hard daily quota caps via IaC.

## Acceptance criteria
- [ ] The Maps API key is **restricted**: to the specific Maps APIs used, and by application/referrer/IP as appropriate (PRD §8.5).
- [ ] **Hard daily quota caps** are set on the Maps APIs so usage **cannot exceed** a configured ceiling (PRD §8.4 #2).
- [ ] Restrictions/caps are **IaC config** in the M01.4 stack (a single value to raise when scaling intentionally).
- [ ] The key value itself stays in **Secret Manager** (M01.4 S4) — only restrictions/quotas are managed here; key never committed.
- [ ] Documented: which APIs are enabled, the cap values, and how to raise them.

## Constraints
- Caps are **hard** (deny over-quota), not just alerts — this is the spend-stop for Maps (PRD §8.4 #2).
- Reuse the M01.4 stack; don't fork Maps config elsewhere (PRD §7.4).

## Definition of done
`pulumi up` applies a restricted Maps key with hard quota caps; exceeding the cap is denied, not billed.

## Dependencies
M01.4 (IaC stack + Maps key secret). Protects Milestone 07 (Maps proxy). Satisfies epic AC2.
