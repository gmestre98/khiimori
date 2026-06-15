import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Profile } from './Profile'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext'

const user = {
  name: 'Ann',
  email: 'ann@example.com',
  avatar: 'https://pic',
  home_base: 'Lisbon',
  theme: 'system',
  default_currency: 'EUR',
}

function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'authenticated',
    user,
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    setProfile: vi.fn(),
    ...overrides,
  }
}

function renderProfile(auth: AuthContextValue = fakeAuth()) {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <Profile />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
  return auth
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Profile', () => {
  it('shows the editable fields and EUR read-only (no currency input)', () => {
    renderProfile()

    expect(screen.getByLabelText(/name/i)).toHaveValue('Ann')
    expect(screen.getByLabelText(/avatar/i)).toHaveValue('https://pic')
    expect(screen.getByLabelText(/home base/i)).toHaveValue('Lisbon')
    expect(screen.getByLabelText(/theme/i)).toHaveValue('system')
    // Email + currency are read-only text, not inputs.
    expect(screen.getByText(/ann@example\.com/)).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.queryByLabelText(/currency/i)).not.toBeInTheDocument()
  })

  it('saves edits via PATCH /me and reflects immediately', async () => {
    const updated = { ...user, name: 'Ann B.', theme: 'dark' }
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }))
    const auth = renderProfile()

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ann B.' } })
    fireEvent.change(screen.getByLabelText(/theme/i), { target: { value: 'dark' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/saved/i))

    // PATCH /me with the edited fields.
    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.method).toBe('PATCH')
    const body = JSON.parse(String(init?.body))
    expect(body).toMatchObject({ name: 'Ann B.', theme: 'dark' })
    // Context updated so the change reflects across the app.
    expect(auth.setProfile).toHaveBeenCalledWith(updated)
  })

  it('surfaces a validation error and does not update the context', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'invalid_profile', message: 'name too long' } }),
        {
          status: 400,
        },
      ),
    )
    const auth = renderProfile()

    fireEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/name too long/i))
    expect(auth.setProfile).not.toHaveBeenCalled()
  })
})
