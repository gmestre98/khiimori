/// <reference types="vite/client" />

// Typed build-time environment variables (Vite exposes VITE_-prefixed vars on
// import.meta.env). Keep this in sync with .env.example.
interface ImportMetaEnv {
  // Base URL of the API the app talks to. Injected at build time; falls back to
  // a local default in src/lib/api.ts when unset.
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
