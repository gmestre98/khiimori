import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
  // Reset the URL so the ?auth_error test doesn't bleed into others.
  window.history.pushState({}, '', '/')
})

describe('SignIn', () => {
  it('starts the Google flow when the control is clicked', () => {
    const auth = fakeAuth()
    render(
      <AuthContext.Provider value={auth}>
        <SignIn />
      </AuthContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }))
    expect(auth.signIn).toHaveBeenCalledOnce()
  })

  it('shows an error when the URL carries ?auth_error', () => {
    window.history.pushState({}, '', '/?auth_error=auth_denied')
    render(
      <AuthContext.Provider value={fakeAuth()}>
        <SignIn />
      </AuthContext.Provider>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows no error on a clean URL', () => {
    render(
      <AuthContext.Provider value={fakeAuth()}>
        <SignIn />
      </AuthContext.Provider>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
