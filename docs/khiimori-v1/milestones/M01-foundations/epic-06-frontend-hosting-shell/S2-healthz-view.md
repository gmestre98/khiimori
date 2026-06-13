# S2 — Health-check view (call `/healthz` and show the result)

> **Status:** ✅ Done — health view (loading/healthy/error) via the S1 client, with Vitest + Testing Library component tests ([#134](https://github.com/gmestre98/khiimori/pull/134)). Probes **`/readyz`**, not `/healthz`: Cloud Run doesn't route `/healthz` externally (corrected in the post-merge `/readyz` fix).

## Context
The proof that the whole stack is wired is the web app successfully calling the API's **`/healthz`** and
showing the result (epic AC2). This story adds that tiny view to the shell, using the env-driven API client
from S1. It's the end-to-end round-trip the deploy story (S4) will verify against production.

Assumes the app shell + API client (**S1**) and the API's `/healthz` (M01.2 S7) exist.

## Task
Add a small view that calls `GET /healthz` on the API and renders success/failure.

## Acceptance criteria
- [x] The shell calls `GET {API_BASE_URL}/healthz` on load (or via a button) using the S1 API client.
- [x] It clearly renders the outcome: healthy vs unreachable/error (status shown to the user).
- [x] Network/error states are handled gracefully (no uncaught promise, no blank screen on failure).
- [x] A unit/component test mocks the fetch and asserts both the success and failure renderings.

## Constraints
- Keep it minimal — this is a connectivity probe, not a real UI (Milestone 09 owns design).
- Use the centralised API client from S1; don't hardcode the URL here.

## Definition of done
Running locally against the API, the view shows `/healthz` healthy; with the API down it shows an error; tests green.

## Dependencies
S1 (shell + API client), M01.2 S7 (`/healthz`). Verified end-to-end in S4; needs CORS from S3.
