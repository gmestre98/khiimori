import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './AuthContext'

// A tiny consumer that renders the auth state, so tests assert what the context
// exposes to the app.
function AuthProbe() {
  const { status, user } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.name ?? ''}</span>
    </div>
  )
}

const profile = {
  name: 'Ann',
  email: 'ann@example.com',
  avatar: '',
  home_base: '',
  theme: 'system',
  default_currency: 'EUR',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AuthProvider', () => {
  it('exposes the authenticated user when /me returns a profile', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(profile), { status: 200 }),
    )

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    // Starts loading, then resolves to authenticated with the user.
    expect(screen.getByTestId('status')).toHaveTextContent('loading')
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('Ann')
  })

  it('is anonymous when /me returns 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('user')).toHaveTextContent('')
  })

  it('sends credentials so the session cookie travels to the API', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    const init = fetchSpy.mock.calls[0][1]
    expect(init?.credentials).toBe('include')
  })
})
