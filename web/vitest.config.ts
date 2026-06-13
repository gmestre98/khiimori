import { defineConfig } from 'vitest/config'

// Vitest configuration, kept separate from vite.config.ts so the production
// build's plugin typing (Vite 8 / @vitejs/plugin-react) stays independent of
// Vitest's bundled Vite. JSX is transformed by esbuild from the tsconfig
// (jsx: react-jsx), so the React plugin isn't needed for the component tests.
export default defineConfig({
  test: {
    // Component tests need a DOM; jsdom provides one under Node.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Tests import describe/it/expect explicitly (no implicit globals).
    globals: false,
    css: false,
  },
})
