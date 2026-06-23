import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
    render(<CurrentTripCard trip={baseTrip} />)
    expect(screen.getByRole('heading', { name: /japan 2026/i })).toBeInTheDocument()
  })

  it('renders the card section with accessible label', () => {
    render(<CurrentTripCard trip={baseTrip} />)
    expect(screen.getByRole('region', { name: /current trip/i })).toBeInTheDocument()
  })

  it('shows today\'s day number based on start_date (Day 5 = 4 days ago + 1)', () => {
    render(<CurrentTripCard trip={baseTrip} />)
    expect(screen.getByText((t) => t.trim() === 'Day 5')).toBeInTheDocument()
  })

  it('shows Day 1 when trip started today', () => {
    const trip = { ...baseTrip, start_date: dateStr(0), end_date: dateStr(7) }
    render(<CurrentTripCard trip={trip} />)
    expect(screen.getByText((t) => t.trim() === 'Day 1')).toBeInTheDocument()
  })

  it('renders the destinations', () => {
    render(<CurrentTripCard trip={baseTrip} />)
    expect(screen.getByText('Tokyo, Kyoto')).toBeInTheDocument()
  })

  it('renders the budget-glance slot region', () => {
    render(<CurrentTripCard trip={baseTrip} />)
    expect(screen.getByRole('region', { name: /budget glance/i })).toBeInTheDocument()
  })

  it('renders the placeholder text when no budgetGlance prop is given', () => {
    render(<CurrentTripCard trip={baseTrip} />)
    expect(screen.getByText(/budget overview coming soon/i)).toBeInTheDocument()
  })

  it('renders custom budgetGlance content when provided', () => {
    render(<CurrentTripCard trip={baseTrip} budgetGlance={<span>€1,234 spent</span>} />)
    expect(screen.getByText('€1,234 spent')).toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
  })

  it('renders a cover image when cover is set', () => {
    const trip = { ...baseTrip, cover: 'https://example.com/cover.jpg' }
    render(<CurrentTripCard trip={trip} />)
    const img = document.querySelector('.current-trip-cover') as HTMLImageElement
    expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg')
  })

  it('omits the cover image when cover is empty', () => {
    render(<CurrentTripCard trip={baseTrip} />)
    expect(document.querySelector('.current-trip-cover')).toBeNull()
  })

  it('omits day number when trip has not started yet', () => {
    const trip = { ...baseTrip, start_date: dateStr(1), end_date: dateStr(10) }
    render(<CurrentTripCard trip={trip} />)
    expect(screen.queryByText(/^Day \d/)).not.toBeInTheDocument()
  })
})
