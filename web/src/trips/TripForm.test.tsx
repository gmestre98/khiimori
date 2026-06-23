import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripForm } from './TripForm'
import type { Trip } from '../lib/api'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const baseTrip: Trip = {
  id: 'trip-1',
  owner_id: 'user-1',
  name: 'Japan 2024',
  destinations: ['Tokyo', 'Kyoto'],
  start_date: '2024-04-01',
  end_date: '2024-04-14',
  base_currency: 'EUR',
  cover: '',
  status: 'active',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  is_current: false,
}

function mockFetch(status: number, body: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  )
}

function renderForm(props?: Partial<React.ComponentProps<typeof TripForm>>) {
  const onSuccess = vi.fn()
  const onCancel = vi.fn()
  render(
    <MemoryRouter>
      <TripForm onSuccess={onSuccess} onCancel={onCancel} {...props} />
    </MemoryRouter>,
  )
  return { onSuccess, onCancel }
}

describe('TripForm — create mode', () => {
  it('renders all fields including read-only EUR currency', () => {
    renderForm()

    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /destinations/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /currency/i })).toHaveValue('EUR')
    expect(screen.getByRole('textbox', { name: /currency/i })).toHaveAttribute('readonly')
  })

  it('shows "Create trip" submit button in create mode', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /create trip/i })).toBeInTheDocument()
  })

  it('shows validation error when name is missing', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/name is required/i)
  })

  it('shows validation error when end date is before start date', async () => {
    renderForm()
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'My trip' },
    })
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2025-06-10' } })
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2025-06-01' } })
    fireEvent.click(screen.getByRole('button', { name: /create trip/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/end date must be/i)
  })

  it('calls createTrip and fires onSuccess on valid submit', async () => {
    mockFetch(201, baseTrip)

    const { onSuccess } = renderForm()

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Japan 2024' },
    })
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2024-04-01' } })
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-04-14' } })

    fireEvent.click(screen.getByRole('button', { name: /create trip/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(baseTrip))
  })

  it('shows server validation error on 400', async () => {
    mockFetch(400, { error: { message: 'name is too long' } })

    renderForm()

    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'a'.repeat(300) },
    })
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2024-04-01' } })
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-04-14' } })

    fireEvent.click(screen.getByRole('button', { name: /create trip/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/name is too long/i)
  })

  it('calls onCancel when Cancel is clicked', () => {
    const { onCancel } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe('TripForm — edit mode', () => {
  it('pre-fills fields from the existing trip', () => {
    renderForm({ trip: baseTrip })

    expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('Japan 2024')
    expect(screen.getByRole('textbox', { name: /destinations/i })).toHaveValue('Tokyo, Kyoto')
    expect(screen.getByLabelText(/start date/i)).toHaveValue('2024-04-01')
    expect(screen.getByLabelText(/end date/i)).toHaveValue('2024-04-14')
  })

  it('shows "Save changes" button in edit mode', () => {
    renderForm({ trip: baseTrip })
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('shows expand info when date range grows', () => {
    renderForm({ trip: baseTrip })
    // Extend end date beyond original 2024-04-14
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-04-20' } })
    expect(screen.getByRole('status')).toHaveTextContent(/add new days/i)
  })

  it('shows shrink warning when date range shrinks', () => {
    renderForm({ trip: baseTrip })
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-04-07' } })
    expect(screen.getByRole('status')).toHaveTextContent(/remove days/i)
  })

  it('shows shrink confirmation dialog on 409 and confirms with force_shrink', async () => {
    // First call returns 409; second call (force_shrink) returns success.
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: '3 day(s) hold data; set force_shrink: true to confirm' } }),
          { status: 409 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(baseTrip), { status: 200 }))

    const { onSuccess } = renderForm({ trip: baseTrip })

    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-04-07' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    // Confirmation dialog appears.
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/3 day/)

    // User confirms.
    fireEvent.click(screen.getByRole('button', { name: /yes, remove days/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(baseTrip))
  })

  it('cancels shrink confirmation without sending force_shrink', async () => {
    mockFetch(409, { error: { message: '2 day(s) hold data; set force_shrink: true to confirm' } })

    renderForm({ trip: baseTrip })

    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-04-07' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await screen.findByRole('alertdialog')
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Dialog closes, form is back.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })
})
