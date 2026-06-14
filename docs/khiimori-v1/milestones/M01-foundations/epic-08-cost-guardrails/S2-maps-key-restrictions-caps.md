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
- [x] The Maps API key is **restricted**: API targets (Maps JS, Geocoding, Places) enforced via `restrict-maps-key` CI job on every merge; no IP/referrer restriction (Cloud Run uses dynamic IPs — by design).
- [x] **Hard daily quota caps** set via `gcp.serviceusage.ConsumerQuotaOverride` in `infra/mapsKey.ts` — requests above `mapsDailyQuota` (default 1 000/day) receive HTTP 429, not a bill (PRD §8.4 #2).
- [x] Quota cap is **IaC config** (`khiimori:mapsDailyQuota` in `tunables.ts`) — single `pulumi config set` + `pulumi up` to raise.
- [x] Key value stays in **Secret Manager** (`khiimori-maps-api-key`) — only quota override managed in IaC; key never committed.
- [x] Documented: APIs (Maps JS / Geocoding / Places), cap value (1 000/day default), and how to raise it — in `scale-up-levers.md` and `cost-guardrails-runbook.md`.

## Constraints
- Caps are **hard** (deny over-quota), not just alerts — this is the spend-stop for Maps (PRD §8.4 #2).
- Reuse the M01.4 stack; don't fork Maps config elsewhere (PRD §7.4).

## Definition of done
`pulumi up` applies a restricted Maps key with hard quota caps; exceeding the cap is denied, not billed.

## Dependencies
M01.4 (IaC stack + Maps key secret). Protects Milestone 07 (Maps proxy). Satisfies epic AC2.
