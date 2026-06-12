# S2 — Privacy, secrets & key review (+ /security-review)

## Context
Confirm **privacy** (trips/photos/journals visible only to owner + invited members) and **secrets**
(OAuth/Maps keys never reach the client; secrets only in Secret Manager; least-privilege service
accounts), combining the automated `/security-review` with a manual pass (PRD §6, §8.5).

## Task
Run the privacy/secrets review using `/security-review` plus a manual audit.

## Acceptance criteria
- [ ] **Privacy:** trips, photos, and journals are confirmed **visible only to owner + invited members**
  (probe staging across identities).
- [ ] **Secrets:** OAuth and **Maps keys never reach the client** (verified in responses/bundles); secrets
  live **only in Secret Manager**; service accounts are **least-privilege**.
- [ ] The project's **`/security-review`** is run over the branch, plus a manual pass on authz, secret
  handling, and key restrictions.
- [ ] Findings are recorded with severity (input to S3).

## Constraints
- Focus the manual pass on the safety-critical areas: `Authorizer` chokepoint (M08), Geo proxy key (M07),
  OAuth/session secrets (M02), media/journal privacy (M06).
- No secret values in the report itself.

## Definition of done
Privacy and secret/key posture are reviewed (automated + manual) with findings recorded.

## Dependencies
Milestones 02/06/07/08, Epic 01 (staging). `/security-review` skill. Findings in S3.
