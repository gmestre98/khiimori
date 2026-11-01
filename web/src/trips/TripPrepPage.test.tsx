import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripPrepPage } from './TripPrepPage'
import * as api from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchPackingItems: vi.fn().mockResolvedValue([
      {
        id: 'p1',
        trip_id: 'trip-1',
        category: 'Papers',
        label: 'Passport',
        quantity: 1,
        note: '',
        packed: false,
        position: 1,
        created_at: '',
        updated_at: '',
      },
    ]),
    fetchPackingTemplates: vi.fn().mockResolvedValue([]),
  }
})
vi.mock('../lib/resourceCache', () => ({
  readCache: vi.fn().mockResolvedValue(null),
  writeCache: vi.fn().mockResolvedValue(undefined),
}))

afterEach(cleanup)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trips/trip-1/packing']}>
      <Routes>
        <Route path="/trips/:tripId/packing" element={<TripPrepPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('TripPrepPage', () => {
  it('opens on Packing inside a Prep page with a To-dos | Packing switch', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Prep' })).toBeInTheDocument()
    const packing = screen.getByRole('button', { name: 'Packing' })
    expect(packing).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(screen.getByText('Passport')).toBeInTheDocument())
  })

  it('switches to To-dos, which is an honest “coming soon” (nothing stored)', async () => {
    const user = userEvent.setup()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderPage()
    await user.click(screen.getByRole('button', { name: 'To-dos' }))
    expect(screen.getByRole('button', { name: 'To-dos' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(/To-dos are coming soon/)
    expect(screen.queryByText('Passport')).not.toBeInTheDocument()
    expect(setItem).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Packing' }))
    await waitFor(() => expect(screen.getByText('Passport')).toBeInTheDocument())
  })
})
