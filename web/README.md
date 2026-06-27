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

## PWA / offline shell

The app is an installable PWA (manifest + icons in [`public/`](public/), M09.4 S1) backed by a
hand-rolled service worker — [`public/sw.js`](public/sw.js), M09.4 S2. No Workbox / build plugin is
used (project no-deps rule, PRD §7.0); the logic is small and auditable.

Registration is in [`src/lib/registerSW.ts`](src/lib/registerSW.ts), called from `main.tsx`. It is
**production-only** — in dev a worker would cache Vite HMR modules and fight the dev server.

**Caching strategy** (`sw.js`):

| Request                            | Strategy                                     | Why                                                      |
| ---------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| Navigations (HTML)                 | network-first → cached `index.html` fallback | fresh shell online; SPA still boots offline              |
| Hashed build assets (`/assets/*`)  | cache-first                                  | Vite fingerprints names, so cached entries are immutable |
| Other same-origin static (icons …) | cache-first                                  | installed shell renders offline                          |
| Cross-origin (API, tiles, fonts)   | not handled (network)                        | this worker owns only the static shell                   |

The shell is precached on `install`; old version caches are cleared on `activate`. The cache version
(`CACHE_VERSION` in `sw.js`) is bumped to invalidate. Offline trip data (S3), the write queue (S4),
and update/version handling (S5) build on this worker.

## Testing

Unit/component tests use **Vitest** + **React Testing Library** (jsdom), added with the app shell
in M01.6 S2 (the project's first frontend tests — Vitest is the natural Vite-native runner). Config
lives in [`vitest.config.ts`](vitest.config.ts), kept separate from `vite.config.ts` so the build's
plugin typing stays independent of Vitest's bundled Vite. CI runs `npm test` in the web gate.
