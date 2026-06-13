# S8 — Web build & deploy to Firebase Hosting

> **Status:** ✅ Done — main builds & deploys the web app to Firebase Hosting (#126).

## Context
The web app builds and deploys to **Firebase Hosting** from the pipeline (PRD §7.5, §7.8). This story adds
the `main`-only stage that builds the production web bundle (with the environment-driven API base URL) and
deploys it to the Hosting site provisioned in IaC (M01.4 S8).

Assumes the web build (**S2**), WIF/Firebase auth (**S5**), and the Hosting site (M01.4 S8) exist.

## Task
Add a `main`-only CI stage that builds the web app and deploys it to Firebase Hosting.

## Acceptance criteria
- [x] Runs **only on `main`**, builds the production web bundle, and deploys it to the M01.4 Hosting site.
- [x] The **API base URL is injected at build time from config/env** (no hardcoded prod URL) (aligns with M01.6 S1).
- [x] Deploy authenticates without long-lived keys (WIF / Firebase CI token stored as a GitHub secret, not in logs) (PRD §8.5).
- [x] The deploy is atomic and the resulting Hosting URL is reported in the run.
- [x] Failure to build or deploy **fails the stage**.

## Constraints
- Reuse the S2 web build — don't reinvent the build here.
- No secrets/tokens in logs; keep within Firebase Hosting free tier (PRD §8.1).

## Definition of done
A merge to `main` builds the web app with the correct API URL and publishes it to Firebase Hosting.

## Dependencies
S2 (web build), S5 (auth), M01.4 S8 (Hosting site). Closely related to M01.6 (app shell + round-trip).
