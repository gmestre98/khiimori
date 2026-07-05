# S3 — CI-minutes watch & cost/load review sign-off

> Deliverable for [S3](S3-ci-minutes-signoff.md). Sign-off date: 2026-07-05.
> Release gate for the M10.4 load/cost review. Consolidates S1 + S2 + CI minutes.

## CI minutes vs. the 2,000-min free cap (PRD §8.4 #4)

The repository `gmestre98/khiimori` is **public**. GitHub Actions minutes are
**free and unlimited for public repositories** — the 2,000-min/month cap only
applies to private repos. So the CI-minutes constraint is satisfied by the
"**keep the repo public**" mitigation named in the PRD, with **no usage risk**.

Observed per-push cost (for reference, not billed): a full `main` push runs
backend lint/vet/test/build, infra typecheck, web build, integration tests
(ephemeral DB), container build, GCP auth, then deploy + E2E — the PR checks
above complete in ~1–1.5 min wall-clock each and the whole pipeline is a few
minutes. The E2E suites (Epics 01–02) are deliberately lean (smoke + one
critical journey + role/offline probes against the deployed env), keeping the
per-run minute cost low even though minutes are free.

**Contingency:** if the repo is ever made private, the same suites at the
current cadence stay well under 2,000 min/mo; if it ever approached the cap the
mitigation is to trim the E2E matrix or restore public visibility.

## Consolidated cost/load checklist

| Item | Source | State |
|------|--------|-------|
| Idle posture ≈€0/mo | [S1](S1-cost-posture-review-REPORT.md) | ✅ Scale-to-zero, Neon/Firebase/Maps free |
| Scale-to-zero (stateless) | S1 | ✅ `minScale=0`, `scaleToZeroActive=true` |
| Billing budget + alert | S1 | ✅ €10/mo, 50/90/100% |
| Maps key restricted | S1 | ✅ 3 Maps APIs only |
| Maps hard quota cap | S1 (F1) | ⚠️ Not live — mitigated (see below) |
| Neon free tier + paid lever | S1 | ✅ Free; config-only paid lever |
| Levers config-only (single setting) | [S2](S2-scaleup-playbook-REPORT.md) | ✅ No code/migration |
| Lever exercised + reverted | S2 | ✅ `minInstances` previewed as 1 revision update, reverted |
| Mobile dashboards/runbook | S2 | ✅ M01.8 runbook reused |
| CI minutes vs free cap | this doc | ✅ Public repo → unlimited free |

## Cost risks & decisions

| ID | Risk | Decision |
|----|------|----------|
| F1 | Maps **hard daily quota cap not live** (`enableMapsQuotaCap` off; no `ConsumerQuotaOverride`). | **Accept for v1.** Overspend bounded by (1) server key restricted to 3 Maps APIs, (2) €10 billing budget alerting at 50/90/100%, (3) usage inside the free tier. Enabling the cap is a one-line lever (`khiimori:enableMapsQuotaCap true` + `pulumi up`) if usage grows. |

No release-blocking cost risks.

## Sign-off

✅ **Cost/load posture met for v1.** Idle cost is ≈€0/mo with scale-to-zero, the
billing budget + Maps key restriction are live, every scale-up lever is a
config-only single setting (one exercised and reverted), the mid-trip playbook
is reachable from a phone, and CI minutes carry no risk (public repo →
unlimited). The single low finding (F1 — Maps hard cap not live) is mitigated
and carries a recorded decision. **No open release-blockers.**

_Signed off by: engineering (M10.4), 2026-07-05._
