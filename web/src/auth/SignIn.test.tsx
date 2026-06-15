import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SignIn } from './SignIn'
import { AuthContext, type AuthContextValue } from './AuthContext'

function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'anonymous',
    user: null,
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    setProfile: vi.fn(),
    ...overrides,
  }
}

// renderSignIn mounts SignIn inside a router (it uses <Navigate> when already
// authenticated) and the given auth context.
function renderSignIn(auth: AuthContextValue) {
  render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <SignIn />
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  // Reset the URL so the ?auth_error test doesn't bleed into others.
  window.history.pushState({}, '', '/')
})

describe('SignIn', () => {
  it('starts the Google flow when the control is clicked', () => {
    const auth = fakeAuth()
    renderSignIn(auth)

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(auth.signIn).toHaveBeenCalledOnce()
  })

  it('shows an error when the URL carries ?auth_error', () => {
    window.history.pushState({}, '', '/?auth_error=auth_denied')
    renderSignIn(fakeAuth())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows no error on a clean URL', () => {
    renderSignIn(fakeAuth())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not show the sign-in control when already authenticated', () => {
    renderSignIn(fakeAuth({ status: 'authenticated' }))
    expect(screen.queryByRole('button', { name: /sign in with google/i })).not.toBeInTheDocument()
  })
})
