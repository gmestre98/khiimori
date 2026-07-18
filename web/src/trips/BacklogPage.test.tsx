import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BacklogPage } from './BacklogPage'
import * as api from '../lib/api'
import type { PlanItem, Trip } from '../lib/api'

function makeTrip(overrides?: Partial<Trip>): Trip {
  return {
    id: 'trip-1',
    owner_id: 'user-1',
    name: 'Test Trip',
    destinations: [],
    start_date: '2026-06-01',
    end_date: '2026-06-03',
    base_currency: 'EUR',
    cover: '',
    status: 'upcoming',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    is_current: false,
    ...overrides,
  }
}

function makePlanItem(overrides?: Partial<PlanItem>): PlanItem {
  return {
    id: 'item-1',
    trip_id: 'trip-1',
    title: 'See the Eiffel Tower',
    sort_order: 0,
    status: 'idea',
    ...overrides,
  }
}

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchBacklog: vi.fn(),
    createPlanItem: vi.fn(),
    fetchDay: vi.fn(),
    promotePlanItem: vi.fn(),
    deletePlanItem: vi.fn(),
  }
})

vi.mock('./useTripShell', () => ({
  useTripShell: vi.fn(() => ({ trip: makeTrip() })),
}))

function renderBacklogPage(tripId = 'trip-1') {
  return render(
    <MemoryRouter initialEntries={[`/trips/${tripId}/backlog`]}>
      <Routes>
        <Route path="/trips/:tripId/backlog" element={<BacklogPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BacklogPage', () => {
  it('shows loading state before data arrives', () => {
    vi.mocked(api.fetchBacklog).mockReturnValue(new Promise(() => {}))
    renderBacklogPage()
    expect(screen.getByText('Loading ideas…')).toBeInTheDocument()
  })

  it('renders backlog items after load', async () => {
    const item = makePlanItem()
    vi.mocked(api.fetchBacklog).mockResolvedValue([item])
    renderBacklogPage()
    await waitFor(() => expect(screen.getByText('See the Eiffel Tower')).toBeInTheDocument())
  })

  it('shows empty message when backlog is empty', async () => {
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    renderBacklogPage()
    await waitFor(() => expect(screen.getByText(/No ideas yet\./)).toBeInTheDocument())
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.fetchBacklog).mockRejectedValue(new Error('network'))
    renderBacklogPage()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load backlog.')
  })

  it('renders the shared plan-item add form', async () => {
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    renderBacklogPage()
    // The backlog reuses the day's full-detail add form (title + kind picker),
    // rather than a title-only quick-add.
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())
    expect(screen.getByRole('group', { name: 'Kind' })).toBeInTheDocument()
  })

  it('adds a new backlog idea via the shared form and shows it in the list', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    const newItem = makePlanItem({ id: 'new-1', title: 'Visit the Louvre' })
    vi.mocked(api.createPlanItem).mockResolvedValue(newItem)

    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Title'), 'Visit the Louvre')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Visit the Louvre')).toBeInTheDocument())
    // Creating from the backlog omits a day (day_id: null) so the item lands in
    // the backlog, exactly as adding to a day sends that day's id.
    expect(api.createPlanItem).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ title: 'Visit the Louvre', day_id: null }),
    )
  })

  it('clears the form after a successful add', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    vi.mocked(api.createPlanItem).mockResolvedValue(makePlanItem({ id: 'new-1', title: 'Picnic' }))

    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

    const input = screen.getByLabelText('Title') as HTMLInputElement
    await user.type(input, 'Picnic')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(input.value).toBe(''))
  })

  it('carries the full plan detail (kind, location) into the created idea', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    vi.mocked(api.createPlanItem).mockResolvedValue(
      makePlanItem({ id: 'new-1', title: 'Ferry to the island' }),
    )

    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Title'), 'Ferry to the island')
    // Switch the kind — a detail that only the full form can capture.
    await user.click(screen.getByRole('button', { name: /Food/ }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(api.createPlanItem).toHaveBeenCalledWith(
        'trip-1',
        expect.objectContaining({ title: 'Ferry to the island', day_id: null, kind: 'food' }),
      ),
    )
  })

  it('shows error when add fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    vi.mocked(api.createPlanItem).mockRejectedValue(new Error('network'))

    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Title')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Title'), 'Bad idea')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not add item.')
  })

  describe('promote to day', () => {
    it('renders a Promote… button on each backlog item', async () => {
      const item = makePlanItem()
      vi.mocked(api.fetchBacklog).mockResolvedValue([item])
      renderBacklogPage()
      await waitFor(() => expect(screen.getByText('See the Eiffel Tower')).toBeInTheDocument())
      expect(
        screen.getByRole('button', { name: /Promote See the Eiffel Tower/ }),
      ).toBeInTheDocument()
    })

    it('clicking Promote… shows the day picker', async () => {
      const user = userEvent.setup()
      const item = makePlanItem()
      vi.mocked(api.fetchBacklog).mockResolvedValue([item])
      renderBacklogPage()
      await waitFor(() => expect(screen.getByText('See the Eiffel Tower')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Promote See the Eiffel Tower/ }))
      expect(screen.getByLabelText('Target day')).toBeInTheDocument()
    })

    it('confirming Promote calls promotePlanItem and removes the item', async () => {
      const user = userEvent.setup()
      const item = makePlanItem()
      vi.mocked(api.fetchBacklog).mockResolvedValue([item])
      vi.mocked(api.fetchDay).mockResolvedValue({
        id: 'day-1',
        trip_id: 'trip-1',
        date: '2026-06-01',
        index: 0,
        notes: '',
        stays: [],
        plan_items: [],
      })
      vi.mocked(api.promotePlanItem).mockResolvedValue({ ...item, day_id: 'day-1' })

      renderBacklogPage()
      await waitFor(() => expect(screen.getByText('See the Eiffel Tower')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Promote See the Eiffel Tower/ }))
      await user.click(screen.getByRole('button', { name: 'Add to day' }))

      await waitFor(() =>
        expect(screen.queryByText('See the Eiffel Tower')).not.toBeInTheDocument(),
      )
      expect(api.promotePlanItem).toHaveBeenCalledWith('trip-1', 'item-1', 'day-1')
    })
  })

  describe('delete', () => {
    it('deletes an idea after confirming and removes it from the list', async () => {
      const user = userEvent.setup()
      const item = makePlanItem()
      vi.mocked(api.fetchBacklog).mockResolvedValue([item])
      vi.mocked(api.deletePlanItem).mockResolvedValue(undefined)

      renderBacklogPage()
      await waitFor(() => expect(screen.getByText('See the Eiffel Tower')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Delete See the Eiffel Tower/ }))
      await user.click(screen.getByRole('button', { name: /Confirm delete See the Eiffel Tower/ }))

      await waitFor(() =>
        expect(screen.queryByText('See the Eiffel Tower')).not.toBeInTheDocument(),
      )
      expect(api.deletePlanItem).toHaveBeenCalledWith('trip-1', 'item-1')
    })

    it('cancelling the delete confirm keeps the item', async () => {
      const user = userEvent.setup()
      const item = makePlanItem()
      vi.mocked(api.fetchBacklog).mockResolvedValue([item])

      renderBacklogPage()
      await waitFor(() => expect(screen.getByText('See the Eiffel Tower')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: /Delete See the Eiffel Tower/ }))
      await user.click(screen.getByRole('button', { name: 'Cancel delete' }))

      expect(screen.getByText('See the Eiffel Tower')).toBeInTheDocument()
      expect(api.deletePlanItem).not.toHaveBeenCalled()
    })
  })
})
