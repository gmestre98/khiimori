# S6 — Document the OAuth sign-in story

## Context
The OAuth flow has author-provided prerequisites (Google Cloud console client ID/secret, authorized
redirect URIs) and several moving parts (consent URL, callback, verification, secrets). A short doc lets
the author reproduce the setup and the next developer understand the flow without reading every file.

## Task
Document the Google OAuth sign-in setup and flow in the `auth` module / docs.

## Acceptance criteria
- [ ] The doc lists the **author-provided prerequisites**: creating the OAuth client, the client
  ID/secret, and the exact authorized redirect URI(s) per environment.
- [ ] It describes the flow end-to-end: `/auth/login` → Google consent → `/auth/callback` → verified
  identity → (provisioning + session, Epics 02–03).
- [ ] It states where secrets live (Secret Manager) and that tokens/codes are never logged.
- [ ] It notes the chosen OAuth/OIDC library (confirmed with the author in S1).

## Constraints
- Keep it concise and accurate to the implementation; link to the epic README rather than restating ACs.

## Definition of done
A developer/author can configure Google OAuth and follow the sign-in flow from the doc alone.

## Dependencies
S1–S5.
