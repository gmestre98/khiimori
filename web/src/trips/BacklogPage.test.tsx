import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BacklogPage } from './BacklogPage'
import * as api from '../lib/api'
import type { PlanItem } from '../lib/api'

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
  }
})

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
    await waitFor(() => expect(screen.getByText('No ideas yet.')).toBeInTheDocument())
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.fetchBacklog).mockRejectedValue(new Error('network'))
    renderBacklogPage()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load backlog.')
  })

  it('renders the quick add form', async () => {
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Idea title')).toBeInTheDocument())
  })

  it('adds a new backlog idea and shows it in the list', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    const newItem = makePlanItem({ id: 'new-1', title: 'Visit the Louvre' })
    vi.mocked(api.createPlanItem).mockResolvedValue(newItem)

    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Idea title')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Idea title'), 'Visit the Louvre')
    await user.click(screen.getByRole('button', { name: 'Add idea' }))

    await waitFor(() => expect(screen.getByText('Visit the Louvre')).toBeInTheDocument())
    expect(api.createPlanItem).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ title: 'Visit the Louvre', day_id: null }),
    )
  })

  it('clears the input after successful add', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    vi.mocked(api.createPlanItem).mockResolvedValue(makePlanItem({ id: 'new-1', title: 'Picnic' }))

    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Idea title')).toBeInTheDocument())

    const input = screen.getByLabelText('Idea title') as HTMLInputElement
    await user.type(input, 'Picnic')
    await user.click(screen.getByRole('button', { name: 'Add idea' }))

    await waitFor(() => expect(input.value).toBe(''))
  })

  it('shows error when add fails', async () => {
    const user = userEvent.setup()
    vi.mocked(api.fetchBacklog).mockResolvedValue([])
    vi.mocked(api.createPlanItem).mockRejectedValue(new Error('network'))

    renderBacklogPage()
    await waitFor(() => expect(screen.getByLabelText('Idea title')).toBeInTheDocument())

    await user.type(screen.getByLabelText('Idea title'), 'Bad idea')
    await user.click(screen.getByRole('button', { name: 'Add idea' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Could not add idea.')
  })
})
