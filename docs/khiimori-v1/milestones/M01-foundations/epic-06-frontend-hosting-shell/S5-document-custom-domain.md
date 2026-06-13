# S5 — Document custom-domain wiring

> **Status:** ✅ Done — custom-domain runbook in [`custom-domain-runbook.md`](custom-domain-runbook.md) (DNS/TLS, IaC-vs-manual, CORS + API-URL updates, verify) ([#137](https://github.com/gmestre98/khiimori/pull/137)).

## Context
The custom domain is **author-provided**, but the wiring to attach it to Firebase Hosting must be documented
so it's a known, repeatable step (epic AC5). This story writes that runbook; it does not purchase or require
the domain.

Assumes the Hosting site (M01.4 S8) and a deployed shell (**S4**) exist.

## Task
Document how to attach a custom domain to the Firebase Hosting site.

## Acceptance criteria
- [x] A short doc explains adding a custom domain in Firebase Hosting: DNS records (A/TXT/CNAME), verification, and managed-cert/TLS provisioning.
- [x] Notes the **environment-driven API base URL** (S1) and CORS allowed-origins (S3) that must be updated when the domain changes.
- [x] States clearly the domain is **author-provided** (~€1/mo / €10–15/yr — PRD §8.3) and not required for v1 to function.
- [x] Captures whether the domain attachment is IaC or a documented manual step (cross-link M01.4 S8).
- [x] Includes a verification step (domain resolves, HTTPS valid, app loads).

## Constraints
- Docs only — no domain purchase or DNS changes performed here.
- Keep it operational and short; don't duplicate Firebase's full docs.

## Definition of done
A reader can, from the doc alone, attach an author-provided domain to Hosting and know what config to update.

## Dependencies
M01.4 S8 (Hosting site), S4 (deployed shell). Satisfies epic AC5.
