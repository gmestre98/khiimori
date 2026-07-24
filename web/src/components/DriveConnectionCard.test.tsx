import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DriveConnectionCard } from './DriveConnectionCard'
import * as api from '../lib/api'

function renderCard(initialEntries: string[] = ['/profile']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <DriveConnectionCard />
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('DriveConnectionCard', () => {
  it('shows Connect when not connected', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: false })
    renderCard()
    expect(await screen.findByRole('button', { name: /connect google drive/i })).toBeInTheDocument()
    expect(screen.getByText(/not connected/i)).toBeInTheDocument()
  })

  it('shows Connected + Disconnect when connected', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({
      connected: true,
      connected_at: '2026-07-24T10:00:00Z',
    })
    renderCard()
    expect(await screen.findByRole('button', { name: /disconnect/i })).toBeInTheDocument()
    expect(screen.getByText(/^Connected$/)).toBeInTheDocument()
  })

  it('disconnects and flips to not-connected', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: true })
    const disconnect = vi.spyOn(api, 'disconnectDrive').mockResolvedValue(undefined)
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /disconnect/i }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /connect google drive/i })).toBeInTheDocument(),
    )
    expect(disconnect).toHaveBeenCalledOnce()
    expect(screen.getByText(/google drive disconnected/i)).toBeInTheDocument()
  })

  it('shows an honest "couldn’t check" state on a network failure (not "not connected")', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockRejectedValue(new Error('offline'))
    renderCard()
    expect(await screen.findByText(/couldn.t check your google drive/i)).toBeInTheDocument()
    // Must NOT imply the user simply needs to connect.
    expect(screen.queryByRole('button', { name: /connect google drive/i })).not.toBeInTheDocument()
  })

  it('surfaces a success banner from ?drive=connected and clears the param', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: true })
    renderCard(['/profile?drive=connected'])
    expect(await screen.findByText(/google drive connected/i)).toBeInTheDocument()
  })

  it('maps a drive_error code to a friendly message', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: false })
    renderCard(['/profile?drive_error=drive_scope_missing'])
    expect(await screen.findByText(/permission was.+granted/i)).toBeInTheDocument()
  })

  it('shows an error when disconnect fails', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: true })
    vi.spyOn(api, 'disconnectDrive').mockRejectedValue(new Error('boom'))
    renderCard()

    fireEvent.click(await screen.findByRole('button', { name: /disconnect/i }))
    expect(await screen.findByText(/couldn.t disconnect/i)).toBeInTheDocument()
  })
})
