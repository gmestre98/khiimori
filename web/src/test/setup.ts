// Vitest global test setup. Registers @testing-library/jest-dom's matchers
// (toBeInTheDocument, toHaveTextContent, …) on Vitest's expect and their types.
import '@testing-library/jest-dom/vitest'

// jsdom does not implement window.matchMedia. Provide a minimal stub that
// returns false for all queries (desktop-mode default) so useMobile() works.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
