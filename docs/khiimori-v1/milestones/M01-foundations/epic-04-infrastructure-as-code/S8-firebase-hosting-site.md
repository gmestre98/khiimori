# S8 — Firebase Hosting site (IaC)

> **Status:** ✅ Done — Firebase Hosting site via IaC (#115). Deployed live to the dev stack.

## Context
The web app deploys to **Firebase Hosting + CDN** (PRD §7.8), and the PRD wants that site provisioned via
IaC alongside everything else (epic AC2). This story provisions/configures the Hosting site in Pulumi so
M01.6 can deploy the app shell to it and M01.5 can deploy from CI.

Assumes the Pulumi scaffold (**S1**) exists. Author-provided: a Firebase project.

## Task
Provision/configure the Firebase Hosting site for the web app via Pulumi.

## Acceptance criteria
- [x] The Firebase Hosting site is provisioned/configured through Pulumi (using the GCP/Firebase provider
  resources available), referencing the author's Firebase project from config.
- [x] Required API(s) (e.g. `firebasehosting.googleapis.com`) are enabled via IaC.
- [x] The site id / default Hosting URL is a Pulumi **stack output** (M01.6 and CORS in M01.6 need the origin).
- [x] Any parts that genuinely cannot be expressed in IaC (e.g. a one-time Firebase project link) are
  **documented** as a manual prerequisite, not left implicit.
- [x] `pulumi up`/`destroy` behave cleanly (within Firebase's IaC support).

## Constraints
- Free-tier Hosting + CDN (PRD §8.1); no paid add-ons.
- Custom domain attachment is documented in M01.6, not required here.

## Definition of done
`pulumi up` provisions/configures the Hosting site and exports its origin URL for M01.5/M01.6.

## Dependencies
S1 (scaffold). Author-provided Firebase project. Consumed by M01.5 (deploy) and M01.6 (shell + CORS).
