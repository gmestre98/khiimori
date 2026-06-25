import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { AuthProvider } from '../auth/AuthProvider'
import { ThemeProvider } from './ThemeProvider'

function makeProfile(theme: string) {
  return {
    name: 'Test',
    email: 'test@example.com',
    avatar: '',
    home_base: '',
    theme,
    default_currency: 'EUR',
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeProvider', () => {
  it('sets data-theme="light" when user prefers light', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeProfile('light')), { status: 200 }),
    )

    render(
      <AuthProvider>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </AuthProvider>,
    )

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('light'))
  })

  it('sets data-theme="dark" when user prefers dark', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeProfile('dark')), { status: 200 }),
    )

    render(
      <AuthProvider>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </AuthProvider>,
    )

    await waitFor(() => expect(document.documentElement.getAttribute('data-theme')).toBe('dark'))
  })

  it('removes data-theme when user prefers system', async () => {
    document.documentElement.setAttribute('data-theme', 'dark')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeProfile('system')), { status: 200 }),
    )

    render(
      <AuthProvider>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </AuthProvider>,
    )

    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false))
  })

  it('does not set data-theme when not authenticated', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))

    render(
      <AuthProvider>
        <ThemeProvider>
          <div />
        </ThemeProvider>
      </AuthProvider>,
    )

    await waitFor(() => expect(document.documentElement.hasAttribute('data-theme')).toBe(false))
  })
})
