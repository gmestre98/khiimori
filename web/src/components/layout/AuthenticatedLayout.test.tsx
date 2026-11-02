import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthenticatedLayout } from './AuthenticatedLayout'

const signOut = vi.fn()
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut, user: null }),
}))
vi.mock('../../lib/useSelectedTrip', () => ({
  useSelectedTrip: () => ({ trips: null, selectedTrip: null, selectTrip: () => {} }),
}))

afterEach(cleanup)

function renderLayout(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AuthenticatedLayout />}>
          <Route path="/" element={<p>Home screen</p>} />
          <Route path="/profile" element={<p>Profile screen</p>} />
          <Route path="/trips/:tripId/*" element={<p>Trip screen</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AuthenticatedLayout', () => {
  it('renders the child route content', () => {
    renderLayout()
    expect(screen.getByText('Home screen')).toBeInTheDocument()
  })

  it('outside a trip: sidebar only, no phone tab bar', () => {
    renderLayout('/')
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Trip' })).not.toBeInTheDocument()
  })

  it('inside a trip: a 5-tab bar — Days, Map, Journal, Money, Prep', () => {
    renderLayout('/trips/t1/map')
    const bar = screen.getByRole('navigation', { name: 'Trip' })
    const labels = within(bar)
      .getAllByRole('link')
      .map((l) => l.textContent)
    expect(labels).toEqual(['Days', 'Map', 'Journal', 'Money', 'Prep'])
    expect(within(bar).getByRole('link', { name: 'Map' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar).getByRole('link', { name: 'Money' })).toHaveAttribute(
      'href',
      '/trips/t1/budget',
    )
  })

  it('keeps Days lit on the backlog', () => {
    renderLayout('/trips/t1/backlog')
    const bar = screen.getByRole('navigation', { name: 'Trip' })
    expect(within(bar).getByRole('link', { name: 'Days' })).toHaveAttribute('aria-current', 'page')
  })

  it('does not treat /trips/new as a trip', () => {
    renderLayout('/trips/new')
    expect(screen.queryByRole('navigation', { name: 'Trip' })).not.toBeInTheDocument()
  })
})
