import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'

const profile = {
  name: 'Ann',
  email: 'ann@example.com',
  avatar: '',
  home_base: '',
  theme: 'system',
  default_currency: 'EUR',
}

// renderApp mounts the app inside a real AuthProvider so the session check and
// sign-in/out wiring are exercised end to end against a mocked API.
function renderApp() {
  render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.pushState({}, '', '/')
})

describe('App auth shell', () => {
  it('shows the sign-in control when anonymous (401 from /me)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
    renderApp()
    expect(await screen.findByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })

  it('shows the signed-in shell and signs out', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      // POST is the logout call; everything else is the GET /me session check.
      if (init?.method === 'POST') return new Response('', { status: 200 })
      return new Response(JSON.stringify(profile), { status: 200 })
    })
    renderApp()

    // Signed in: greeting + sign-out control.
    expect(await screen.findByText(/signed in as/i)).toHaveTextContent('Ann')
    const signOut = screen.getByRole('button', { name: /sign out/i })

    // Signing out returns to the anonymous sign-in surface.
    fireEvent.click(signOut)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument(),
    )
  })
})
