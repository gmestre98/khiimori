import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './AuthContext'
import { apiFetch } from '../lib/api'
import { cacheKeys } from '../lib/cacheKeys'
import { readCache, writeCache } from '../lib/resourceCache'

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

  it('caches the profile after a successful session check', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(profile), { status: 200 }),
    )

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await waitFor(async () =>
      expect((await readCache(cacheKeys.profile()))?.data).toMatchObject({ name: 'Ann' }),
    )
  })

  it('stays authenticated offline by falling back to the cached profile', async () => {
    // A previous session left a profile in the on-device cache…
    await writeCache(cacheKeys.profile(), profile)
    // …and now the network is down: GET /me rejects instead of returning 401.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    // No forced re-login: the app trusts the cached profile and stays signed in.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('Ann')
  })

  it('is anonymous offline when there is no cached profile', async () => {
    // Nothing cached (first-ever use, or signed out) + network down.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(screen.getByTestId('user')).toHaveTextContent('')
  })

  it('clears the cached profile on sign-out', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(profile), { status: 200 }),
    )

    function Probe() {
      const { status, signOut } = useAuth()
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button onClick={() => void signOut()}>sign out</button>
        </div>
      )
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    await waitFor(async () => expect(await readCache(cacheKeys.profile())).not.toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'sign out' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
    expect(await readCache(cacheKeys.profile())).toBeNull()
  })

  it('flips to anonymous when an authenticated call later returns 401 (S4 re-auth)', async () => {
    // The session check (GET /me) succeeds; a later call returns 401 (the
    // session expired mid-use), which must drive the app back to anonymous.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') return new Response('', { status: 401 })
      return new Response(JSON.stringify(profile), { status: 200 })
    })

    function Probe() {
      const { status } = useAuth()
      return (
        <div>
          <span data-testid="status">{status}</span>
          <button onClick={() => void apiFetch('/some-protected', { method: 'POST' })}>call</button>
        </div>
      )
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    fireEvent.click(screen.getByRole('button', { name: 'call' }))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anonymous'))
  })
})
