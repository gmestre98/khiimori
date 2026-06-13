# web

The Khiimori web app (and future installable PWA): **React + TypeScript**, built with **Vite**.
Scaffolded in [Epic M01.1 · S5](../docs/khiimori-v1/milestones/M01-foundations/epic-01-repo-scaffolding/S5-web-app-vite.md).
The minimal app shell lands in [Epic M01.6](../docs/khiimori-v1/milestones/M01-foundations/epic-06-frontend-hosting-shell/README.md); the product UI and theming arrive in Milestone 09.

## Prerequisites

- Node.js 20+ (developed on Node 24).

## Configuration

The app reaches the API through a single env-driven base URL — there is no hardcoded production URL
in the source. Copy [`.env.example`](.env.example) to `.env.local` to override it locally:

| Variable            | Required | Default (when unset)    | Notes                                                       |
| ------------------- | -------- | ----------------------- | ----------------------------------------------------------- |
| `VITE_API_BASE_URL` | No       | `http://localhost:8080` | API base URL, injected at build time. Prod = Cloud Run URL. |

Only `VITE_`-prefixed variables are exposed to the client. The base URL is centralised in
[`src/lib/api.ts`](src/lib/api.ts) (`apiBaseURL` / `apiUrl`) — the one place to change it.

## Commands

```sh
npm install        # install dependencies
npm run dev        # start the Vite dev server
npm run build      # type-check (tsc -b) and produce a production bundle in dist/
npm test           # run the unit/component tests once (Vitest)
npm run test:watch # run the tests in watch mode
npm run preview    # serve the production build locally
```

## Testing

Unit/component tests use **Vitest** + **React Testing Library** (jsdom), added with the app shell
in M01.6 S2 (the project's first frontend tests — Vitest is the natural Vite-native runner). Config
lives in [`vitest.config.ts`](vitest.config.ts), kept separate from `vite.config.ts` so the build's
plugin typing stays independent of Vitest's bundled Vite. CI runs `npm test` in the web gate.
