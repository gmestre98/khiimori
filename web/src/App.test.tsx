import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

// renderApp mounts the app inside the router + a real AuthProvider so routing,
// gating, the session check, and sign-in/out are exercised end to end against a
// mocked API. initialPath sets the starting route.
function renderApp(initialPath = '/') {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
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
    const emptyTrips = { current: [], upcoming: [], past: [] }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (init?.method === 'POST') return new Response('', { status: 200 })
      if (String(input).includes('/trips'))
        return new Response(JSON.stringify(emptyTrips), { status: 200 })
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

  it('shows a loading placeholder before the session is known (no protected content)', async () => {
    // A fetch that never resolves keeps the session check in flight.
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}))
    renderApp('/')

    expect(await screen.findByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument()
  })

  it('redirects an anonymous deep link to the sign-in surface (gating)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
    renderApp('/profile') // undefined route → catch-all → "/" → gated → /signin

    expect(await screen.findByRole('button', { name: /sign in with google/i })).toBeInTheDocument()
  })
})
