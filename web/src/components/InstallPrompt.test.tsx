import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InstallPrompt } from './InstallPrompt'

const DISMISS_KEY = 'khiimori:install-dismissed'

// Fire a synthetic beforeinstallprompt with a stub prompt()/userChoice so the
// component takes its Chromium (native-prompt) code path.
function fireBeforeInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const e = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: string }>
  }
  e.prompt = vi.fn(async () => {})
  e.userChoice = Promise.resolve({ outcome })
  window.dispatchEvent(e)
  return e
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('InstallPrompt', () => {
  it('renders nothing until the platform signals it is installable', () => {
    const { container } = render(<InstallPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('shows an Install button once beforeinstallprompt fires', async () => {
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()
    expect(await screen.findByRole('button', { name: 'Install' })).toBeInTheDocument()
  })

  it('stays hidden when the user previously dismissed it', () => {
    localStorage.setItem(DISMISS_KEY, '1')
    const { container } = render(<InstallPrompt />)
    fireBeforeInstallPrompt()
    expect(container.querySelector('.install-prompt')).toBeNull()
  })

  it('persists dismissal and hides the banner on "Not now"', async () => {
    render(<InstallPrompt />)
    fireBeforeInstallPrompt()
    await screen.findByRole('button', { name: 'Install' })

    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))

    await waitFor(() => expect(screen.queryByText('Install Khiimori')).not.toBeInTheDocument())
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1')
  })

  it('triggers the native prompt and hides on Install', async () => {
    render(<InstallPrompt />)
    const event = fireBeforeInstallPrompt('accepted')
    await screen.findByRole('button', { name: 'Install' })

    await userEvent.click(screen.getByRole('button', { name: 'Install' }))

    expect(event.prompt).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByText('Install Khiimori')).not.toBeInTheDocument())
  })
})
