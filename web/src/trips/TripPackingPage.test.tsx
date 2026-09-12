import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripPackingPage } from './TripPackingPage'
import * as api from '../lib/api'
import type { PackingItem } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchPackingItems: vi.fn(),
    createPackingItem: vi.fn(),
    updatePackingItem: vi.fn(),
    deletePackingItem: vi.fn(),
    fetchPackingTemplates: vi.fn(),
    createPackingTemplate: vi.fn(),
    applyPackingTemplate: vi.fn(),
  }
})

// Cache is a no-op in tests: readCache misses (straight to fetch), writeCache is inert.
vi.mock('../lib/resourceCache', () => ({
  readCache: vi.fn().mockResolvedValue(null),
  writeCache: vi.fn().mockResolvedValue(undefined),
}))

function mkItem(partial: Partial<PackingItem>): PackingItem {
  return {
    id: 'i1',
    trip_id: 'trip-1',
    category: '',
    label: 'Item',
    quantity: 1,
    note: '',
    packed: false,
    position: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/trips/trip-1/packing']}>
      <Routes>
        <Route path="/trips/:tripId/packing" element={<TripPackingPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const mockedApi = api as unknown as {
  fetchPackingItems: ReturnType<typeof vi.fn>
  createPackingItem: ReturnType<typeof vi.fn>
  updatePackingItem: ReturnType<typeof vi.fn>
  deletePackingItem: ReturnType<typeof vi.fn>
  fetchPackingTemplates: ReturnType<typeof vi.fn>
}

describe('TripPackingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.fetchPackingTemplates.mockResolvedValue([])
  })
  afterEach(cleanup)

  it('renders items grouped by category with a progress caption', async () => {
    mockedApi.fetchPackingItems.mockResolvedValue([
      mkItem({ id: 'i1', category: 'Safety gear', label: 'Steel-toe boots', packed: true }),
      mkItem({ id: 'i2', category: 'Safety gear', label: 'Ear protection' }),
      mkItem({ id: 'i3', category: '', label: 'Passport' }),
    ])
    renderPage()

    expect(await screen.findByText('Steel-toe boots')).toBeInTheDocument()
    // Category group headers (blank category shows as "Other").
    expect(screen.getByText('Safety gear')).toBeInTheDocument()
    expect(screen.getByText('Other')).toBeInTheDocument()
    // 1 of 3 packed.
    expect(screen.getByText('1 of 3 packed')).toBeInTheDocument()
  })

  it('shows the empty state when there are no items', async () => {
    mockedApi.fetchPackingItems.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/Nothing packed yet/i)).toBeInTheDocument()
  })

  it('toggles an item packed via the checkbox', async () => {
    const user = userEvent.setup()
    mockedApi.fetchPackingItems.mockResolvedValue([
      mkItem({ id: 'i1', label: 'Gloves', packed: false }),
    ])
    mockedApi.updatePackingItem.mockResolvedValue(mkItem({ id: 'i1', label: 'Gloves', packed: true }))
    renderPage()

    const checkbox = await screen.findByRole('checkbox', { name: /Mark Gloves as packed/i })
    await user.click(checkbox)

    await waitFor(() =>
      expect(mockedApi.updatePackingItem).toHaveBeenCalledWith('trip-1', 'i1', { packed: true }),
    )
  })

  it('adds a new item with category, quantity and note', async () => {
    const user = userEvent.setup()
    mockedApi.fetchPackingItems.mockResolvedValue([])
    mockedApi.createPackingItem.mockResolvedValue(
      mkItem({ id: 'new', category: 'Safety gear', label: 'Dust mask', quantity: 3, note: 'FFP2' }),
    )
    renderPage()

    await screen.findByText(/Nothing packed yet/i)
    await user.type(screen.getByLabelText('Item'), 'Dust mask')
    await user.type(screen.getByLabelText('Category'), 'Safety gear')
    const qty = screen.getByLabelText('Quantity')
    await user.clear(qty)
    await user.type(qty, '3')
    await user.type(screen.getByLabelText('Note'), 'FFP2')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(mockedApi.createPackingItem).toHaveBeenCalledWith('trip-1', {
        label: 'Dust mask',
        category: 'Safety gear',
        quantity: 3,
        note: 'FFP2',
      }),
    )
    expect(await screen.findByText('Dust mask')).toBeInTheDocument()
  })

  it('removes an item after confirming', async () => {
    const user = userEvent.setup()
    mockedApi.fetchPackingItems.mockResolvedValue([mkItem({ id: 'i1', label: 'Gloves' })])
    mockedApi.deletePackingItem.mockResolvedValue(undefined)
    renderPage()

    await screen.findByText('Gloves')
    await user.click(screen.getByRole('button', { name: /Remove Gloves/i }))
    // Confirm in the modal.
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() =>
      expect(mockedApi.deletePackingItem).toHaveBeenCalledWith('trip-1', 'i1'),
    )
  })
})
