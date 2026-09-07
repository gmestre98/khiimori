import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TripForm } from './TripForm'
import type { Trip } from '../lib/api'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// jsdom has no object-URL support; stub it so the cover preview can be created.
beforeEach(() => {
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-preview')
  globalThis.URL.revokeObjectURL = vi.fn()
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
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))
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
          JSON.stringify({
            error: { message: '3 day(s) hold data; set force_shrink: true to confirm' },
          }),
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

describe('TripForm — cover upload', () => {
  // routeFetch dispatches by URL/method: create → 201, cover upload → 200 with a
  // signed cover_url, everything else → 200 echo.
  function routeFetch() {
    return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      const method = (init?.method ?? 'GET').toUpperCase()
      if (url.includes('/cover') && method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ...baseTrip, cover: 'gs://b/x', cover_url: 'https://signed/x' }),
            { status: 200 },
          ),
        )
      }
      if (url.endsWith('/trips') && method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify(baseTrip), { status: 201 }))
      }
      return Promise.resolve(new Response(JSON.stringify(baseTrip), { status: 200 }))
    })
  }

  function fillRequired() {
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Japan 2024' },
    })
    fireEvent.change(screen.getByLabelText(/start date/i), { target: { value: '2024-04-01' } })
    fireEvent.change(screen.getByLabelText(/end date/i), { target: { value: '2024-04-14' } })
  }

  it('uploads the picked cover after creating the trip', async () => {
    const fetchSpy = routeFetch()
    const { onSuccess } = renderForm()
    fillRequired()

    const file = new File(['bytes'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText(/cover photo/i), { target: { files: [file] } })
    // The preview replaces the drop zone.
    expect(await screen.findByRole('button', { name: /replace/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /create trip/i }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    // Resolved with the uploaded trip (signed cover_url), not the bare create result.
    expect(onSuccess.mock.calls[0][0].cover_url).toBe('https://signed/x')
    // Exactly one cover upload was made, to the created trip.
    const coverCalls = fetchSpy.mock.calls.filter(([u, i]) => {
      const url = typeof u === 'string' ? u : (u as Request).url
      return (
        url.includes(`/trips/${baseTrip.id}/cover`) && (i?.method ?? '').toUpperCase() === 'POST'
      )
    })
    expect(coverCalls).toHaveLength(1)
  })

  it('round-trips the stored cover reference on edit without clobbering it', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(baseTrip), { status: 200 }))

    renderForm({ trip: { ...baseTrip, cover: 'gs://b/existing', cover_url: 'https://signed/e' } })
    fireEvent.change(screen.getByRole('textbox', { name: /name/i }), {
      target: { value: 'Renamed' },
    })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.cover).toBe('gs://b/existing')
  })

  it('rejects a non-image file with an error and no upload', () => {
    const fetchSpy = routeFetch()
    renderForm()

    const file = new File(['x'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(screen.getByLabelText(/cover photo/i), { target: { files: [file] } })

    expect(screen.getByRole('alert')).toHaveTextContent(/JPG, PNG/i)
    // No preview, nothing uploaded.
    expect(screen.queryByRole('button', { name: /replace/i })).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
