import { defineConfig } from 'vitest/config'

// Vitest configuration, kept separate from vite.config.ts so the production
// build's plugin typing (Vite 8 / @vitejs/plugin-react) stays independent of
// Vitest's bundled Vite. JSX is transformed by esbuild from the tsconfig
// (jsx: react-jsx), so the React plugin isn't needed for the component tests.
export default defineConfig({
  test: {
    // Tests drive fetch directly; never let a local .env.local
    // (VITE_USE_MOCK_TRIPS=true, used to run the app without a backend) leak in
    // and swap real fetch for the dev mock. Keep test runs deterministic.
    env: { VITE_USE_MOCK_TRIPS: 'false' },
    // Component tests need a DOM; jsdom provides one under Node.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Tests import describe/it/expect explicitly (no implicit globals).
    globals: false,
    css: false,
  },
})
