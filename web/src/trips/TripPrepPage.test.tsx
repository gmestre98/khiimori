import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripPrepPage } from './TripPrepPage'
import { dueLabel, groupTodos } from './todoGroups'
import * as api from '../lib/api'
import type { TripTodo } from '../lib/api'

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
    fetchTodos: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
  }
})
vi.mock('../lib/resourceCache', () => ({
  readCache: vi.fn().mockResolvedValue(null),
  writeCache: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/format', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../lib/format')>()
  return { ...orig, localToday: () => '2026-11-10' }
})

function todo(overrides: Partial<TripTodo>): TripTodo {
  return {
    id: 't',
    trip_id: 'trip-1',
    title: 'Task',
    note: '',
    due_date: null,
    done: false,
    position: 1,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const seeded: TripTodo[] = [
  todo({ id: 't1', title: 'Check the e-visa rule', due_date: '2026-11-08', position: 1 }),
  todo({ id: 't2', title: 'Mauritanian visa', due_date: '2026-11-28', note: 'anrpts.gov.mr' }),
  todo({ id: 't3', title: 'Print passport copies', position: 3 }),
]

beforeEach(() => {
  vi.mocked(api.fetchTodos).mockResolvedValue(seeded)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

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
  it('opens on To-dos, grouped by deadline with overdue first and undated last', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Prep' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'To-dos' })).toHaveAttribute('aria-pressed', 'true')

    const overdue = await screen.findByRole('region', { name: 'Overdue' })
    expect(within(overdue).getByText('Check the e-visa rule')).toBeInTheDocument()
    expect(within(overdue).getByText('2 days late')).toBeInTheDocument()
    const byDate = screen.getByRole('region', { name: 'By 28 Nov' })
    expect(within(byDate).getByText('anrpts.gov.mr')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Anytime' })).getByText('Print passport copies'),
    ).toBeInTheDocument()
    expect(screen.getByText('0 of 3 done · 1 overdue')).toBeInTheDocument()
  })

  it('adds a to-do with a deadline', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createTodo).mockResolvedValue(
      todo({ id: 't9', title: 'Travel insurance', due_date: '2026-11-17', position: 9 }),
    )
    renderPage()
    await screen.findByText('Print passport copies')
    const form = screen.getByRole('form', { name: 'Add to-do' })
    await user.type(within(form).getByLabelText('To-do'), 'Travel insurance')
    await user.type(within(form).getByLabelText('Due date (optional)'), '2026-11-17')
    await user.click(within(form).getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(api.createTodo).toHaveBeenCalledWith('trip-1', {
        id: expect.any(String),
        title: 'Travel insurance',
        due_date: '2026-11-17',
        note: '',
      }),
    )
    expect(
      within(await screen.findByRole('region', { name: 'By 17 Nov' })).getByText(
        'Travel insurance',
      ),
    ).toBeInTheDocument()
  })

  it('ticks a to-do done optimistically', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updateTodo).mockResolvedValue({ ...seeded[2], done: true })
    renderPage()
    await user.click(await screen.findByLabelText('Mark Print passport copies as done'))
    expect(screen.getByLabelText('Mark Print passport copies as not done')).toBeChecked()
    expect(api.updateTodo).toHaveBeenCalledWith('trip-1', 't3', { done: true })
  })

  it('edits a to-do and clears its deadline', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updateTodo).mockResolvedValue({ ...seeded[1], due_date: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Mauritanian visa' }))
    const form = screen.getByRole('form', { name: 'Edit Mauritanian visa' })
    await user.clear(within(form).getByLabelText('Due date'))
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(api.updateTodo).toHaveBeenCalledWith('trip-1', 't2', {
      title: 'Mauritanian visa',
      due_date: null,
      note: 'anrpts.gov.mr',
    })
  })

  it('edits the to-do text itself, saving with Enter', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updateTodo).mockResolvedValue({
      ...seeded[1],
      title: 'Mauritanian visa (e-visa)',
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Mauritanian visa' }))
    const form = screen.getByRole('form', { name: 'Edit Mauritanian visa' })
    const title = within(form).getByLabelText('To-do')
    expect(title).toHaveFocus()
    await user.type(title, ' (e-visa){Enter}')
    expect(api.updateTodo).toHaveBeenCalledWith('trip-1', 't2', {
      title: 'Mauritanian visa (e-visa)',
      due_date: seeded[1].due_date,
      note: 'anrpts.gov.mr',
    })
  })

  it('clears a deadline with No date', async () => {
    const user = userEvent.setup()
    vi.mocked(api.updateTodo).mockResolvedValue({ ...seeded[1], due_date: null })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Edit Mauritanian visa' }))
    const form = screen.getByRole('form', { name: 'Edit Mauritanian visa' })
    await user.click(within(form).getByRole('button', { name: 'No date' }))
    await user.click(within(form).getByRole('button', { name: 'Save' }))
    expect(api.updateTodo).toHaveBeenCalledWith(
      'trip-1',
      't2',
      expect.objectContaining({ due_date: null }),
    )
  })

  it('removes a to-do after confirming', async () => {
    const user = userEvent.setup()
    vi.mocked(api.deleteTodo).mockResolvedValue()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Remove Print passport copies' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(api.deleteTodo).toHaveBeenCalledWith('trip-1', 't3')
    await waitFor(() => expect(screen.queryByText('Print passport copies')).not.toBeInTheDocument())
  })

  it('shows an empty state when there are no to-dos', async () => {
    vi.mocked(api.fetchTodos).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/Nothing to do yet/)).toBeInTheDocument()
  })

  it('switches to Packing', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Packing' }))
    expect(screen.getByRole('button', { name: 'Packing' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(screen.getByText('Passport')).toBeInTheDocument())
  })
})

describe('to-do helpers', () => {
  it('describes deadlines relative to today', () => {
    expect(dueLabel('2026-11-10', '2026-11-10', false)).toBe('Today')
    expect(dueLabel('2026-11-11', '2026-11-10', false)).toBe('Tomorrow')
    expect(dueLabel('2026-11-15', '2026-11-10', false)).toBe('In 5 days')
    expect(dueLabel('2026-11-09', '2026-11-10', false)).toBe('1 day late')
    expect(dueLabel('2026-12-30', '2026-11-10', false)).toBe('30 Dec')
    expect(dueLabel('2026-11-09', '2026-11-10', true)).toBe('9 Nov')
  })

  it('keeps a done past-due to-do in its date group, not Overdue', () => {
    const groups = groupTodos(
      [
        todo({ id: 'a', due_date: '2026-11-01', done: true }),
        todo({ id: 'b', due_date: '2026-11-02' }),
      ],
      '2026-11-10',
    )
    expect(groups.map((g) => g.title)).toEqual(['Overdue', 'By 1 Nov'])
  })
})
