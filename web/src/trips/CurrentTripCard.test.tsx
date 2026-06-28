import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CurrentTripCard } from './CurrentTripCard'
import type { Trip } from '../lib/api'

afterEach(cleanup)

const today = new Date()
today.setHours(0, 0, 0, 0)
function dateStr(offsetDays: number): string {
  const d = new Date(today)
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const baseTrip: Trip = {
  id: 'trip-1',
  owner_id: 'user-1',
  name: 'Japan 2026',
  destinations: ['Tokyo', 'Kyoto'],
  start_date: dateStr(-4), // started 4 days ago → Day 5
  end_date: dateStr(5),
  base_currency: 'EUR',
  cover: '',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_current: true,
}

describe('CurrentTripCard', () => {
  it('renders the trip name prominently as a heading', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: /japan 2026/i })).toBeInTheDocument()
  })

  it('renders the card section with accessible label', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('region', { name: /current trip/i })).toBeInTheDocument()
  })

  it("shows today's day number based on start_date (Day 5 = 4 days ago + 1)", () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/^Day 5 \/ \d+$/)).toBeInTheDocument()
  })

  it('shows Day 1 when trip started today', () => {
    const trip = { ...baseTrip, start_date: dateStr(0), end_date: dateStr(7) }
    render(
      <MemoryRouter>
        <CurrentTripCard trip={trip} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/^Day 1 \/ \d+$/)).toBeInTheDocument()
  })

  it('renders the destinations', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/tokyo.*kyoto/i)).toBeInTheDocument()
  })

  it('renders the budget-glance slot region', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('region', { name: /budget glance/i })).toBeInTheDocument()
  })

  it('renders the placeholder text when no budgetGlance prop is given', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/budget overview loading/i)).toBeInTheDocument()
  })

  it('renders custom budgetGlance content when provided', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} budgetGlance={<span>€1,234 spent</span>} />
      </MemoryRouter>,
    )
    expect(screen.getByText('€1,234 spent')).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
  })

  it('renders the teal panel with day counter', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    expect(document.querySelector('.current-trip-panel')).not.toBeNull()
  })

  it('omits day number when trip has not started yet', () => {
    const trip = { ...baseTrip, start_date: dateStr(1), end_date: dateStr(10) }
    render(
      <MemoryRouter>
        <CurrentTripCard trip={trip} />
      </MemoryRouter>,
    )
    expect(screen.queryByText(/^Day \d/)).not.toBeInTheDocument()
  })

  it('renders an Edit link pointing to the trip edit route', () => {
    render(
      <MemoryRouter>
        <CurrentTripCard trip={baseTrip} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /edit/i })
    expect(link).toHaveAttribute('href', '/trips/trip-1/edit')
  })
})
