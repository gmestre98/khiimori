# Khiimori — working agreement & repo notes

## Ownership of the delivery flow

**Own the whole flow end to end, and just do it — don't stop to ask for approval at
each step.** When asked to make a change, take it all the way: implement it, verify it,
create a branch and PR, get CI green, merge, and follow the deployment through to the
live app. Report back once it's deployed so I can test it. Only pause for confirmation
when I explicitly say so, or when a step is genuinely destructive/irreversible beyond a
normal merge-and-deploy (e.g. deleting data, rotating secrets, force-pushing shared
history). "Make change X" means "ship change X."

## Deployment

Deploy is fully automated by `.github/workflows/ci.yml` — there is no manual deploy step:

- Every PR runs the gates (backend, web, infra, integration, container image build).
- Merging to `main` triggers the deploy jobs automatically: `build-push` → `deploy`
  (DB migrations, then Cloud Run) and `deploy-web` (Firebase Hosting), then `e2e`
  smoke/journey tests against the live environment.
- `main` is protected: the required checks must be green before merge (enforced for
  admins too). So the path to prod is always: branch → PR → checks green → merge →
  watch the `main` run finish.
- Web app: https://intricate-reef-424222-d6-web.web.app · API served same-origin at `/api`.

## Local UI development

Run the web app without a backend using the dev mock: set `VITE_USE_MOCK_TRIPS=true`
in `web/.env.local`, then `npm run dev` in `web/`. This installs a `fetch` interceptor
(`web/src/lib/dev-mock.ts`) serving canned data (`web/src/lib/mock-trips.ts`) and
bypasses auth, so the whole app is drivable for visual checks. Remove the flag when done.
