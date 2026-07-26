import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ExportDialog } from './ExportDialog'
import * as api from '../lib/api'

function renderDialog() {
  render(<ExportDialog tripId="t1" tripName="Northern Portugal" open onClose={() => {}} />)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ExportDialog', () => {
  it('shows Connect when Drive is not connected', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: false })
    renderDialog()
    expect(await screen.findByRole('button', { name: /connect google drive/i })).toBeInTheDocument()
  })

  it('exports when connected and shows the doc + folder links', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: true })
    const exportSpy = vi.spyOn(api, 'exportTripToGoogleDoc').mockResolvedValue({
      doc_url: 'https://docs.google.com/d/abc',
      folder_url: 'https://drive.google.com/drive/folders/f1',
      exported_at: '2026-07-25T10:00:00Z',
    })
    renderDialog()

    const btn = await screen.findByRole('button', { name: /^export$/i })
    fireEvent.click(btn)

    expect(await screen.findByRole('link', { name: /open in google docs/i })).toHaveAttribute(
      'href',
      'https://docs.google.com/d/abc',
    )
    expect(screen.getByRole('link', { name: /open folder/i })).toHaveAttribute(
      'href',
      'https://drive.google.com/drive/folders/f1',
    )
    expect(exportSpy).toHaveBeenCalledWith('t1', { includePhotos: true, includeBudget: true })
  })

  it('passes toggles through to the export call', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: true })
    const exportSpy = vi.spyOn(api, 'exportTripToGoogleDoc').mockResolvedValue({
      doc_url: 'd',
      folder_url: 'f',
      exported_at: 'x',
    })
    renderDialog()

    await screen.findByRole('button', { name: /^export$/i })
    fireEvent.click(screen.getByLabelText(/include photos/i)) // turn off
    fireEvent.click(screen.getByRole('button', { name: /^export$/i }))

    await waitFor(() =>
      expect(exportSpy).toHaveBeenCalledWith('t1', { includePhotos: false, includeBudget: true }),
    )
  })

  it('drops back to Connect when the export needs (re)connect', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: true })
    vi.spyOn(api, 'exportTripToGoogleDoc').mockRejectedValue(
      new api.DriveActionRequiredError('drive_reconnect_required'),
    )
    renderDialog()

    fireEvent.click(await screen.findByRole('button', { name: /^export$/i }))
    expect(await screen.findByRole('button', { name: /connect google drive/i })).toBeInTheDocument()
  })

  it('shows an error with retry when the export fails', async () => {
    vi.spyOn(api, 'fetchDriveConnection').mockResolvedValue({ connected: true })
    vi.spyOn(api, 'exportTripToGoogleDoc').mockRejectedValue(new Error('boom'))
    renderDialog()

    fireEvent.click(await screen.findByRole('button', { name: /^export$/i }))
    expect(await screen.findByText(/couldn.t export/i)).toBeInTheDocument()
    // The button returns to an actionable state.
    expect(screen.getByRole('button', { name: /^export$/i })).toBeEnabled()
  })
})
