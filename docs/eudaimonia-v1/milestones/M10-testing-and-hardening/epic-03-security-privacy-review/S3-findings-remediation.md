# S3 — Findings remediation & sign-off

## Context
The security & privacy review is a **release gate** — findings must be **resolved before v1 ships** (PRD
§6, §8.5). This story tracks remediation and records sign-off.

## Task
Triage, remediate, and sign off the review findings.

## Acceptance criteria
- [ ] Findings from S1 (authz gaps) and S2 (privacy/secrets) are **triaged by severity**.
- [ ] **Release-blocking** findings (auth bypass, key/secret exposure, privacy leak) are **fixed and
  re-verified**.
- [ ] Lower-severity findings are recorded with a decision (fix now / track post-v1).
- [ ] A short **sign-off** records that the gate is met (no open release-blockers).

## Constraints
- Re-verify fixes (re-run the relevant audit/test), don't just mark resolved.
- Authorization/secret/privacy issues are release-blocking by default (PRD §6, §8.5).

## Definition of done
All release-blocking security/privacy findings are resolved and re-verified, with a recorded sign-off.

## Dependencies
S1, S2. Gates v1 release; coordinates with the relevant feature milestones for fixes.
