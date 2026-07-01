import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { registerServiceWorker } from './lib/registerSW.ts'

// Dev-only: serve canned API responses so the app runs without a backend.
// Behind VITE_USE_MOCK_TRIPS so production builds never include this.
if (import.meta.env.VITE_USE_MOCK_TRIPS === 'true') {
  const { installDevMock } = await import('./lib/dev-mock.ts')
  installDevMock()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

// Register the PWA app-shell service worker (M09.4 S2). No-ops in dev and where
// unsupported; never blocks render.
void registerServiceWorker()
