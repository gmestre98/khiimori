import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthenticatedLayout } from './AuthenticatedLayout'

// useAuth is mocked — AuthenticatedLayout only needs signOut from it.
const signOut = vi.fn()
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut }),
}))

afterEach(cleanup)

function renderLayout(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AuthenticatedLayout />}>
          <Route path="/" element={<p>Home screen</p>} />
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

  it('provides both the sidebar (laptop) and bottom nav (mobile) navigation', () => {
    renderLayout()
    // Sidebar primary nav + bottom nav both render the primary destinations.
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    // "Trips" appears in both navs.
    expect(screen.getAllByRole('link', { name: /trips/i }).length).toBeGreaterThanOrEqual(2)
  })

  it('exposes the primary "New trip" thumb action', () => {
    renderLayout()
    const fab = screen.getByRole('link', { name: 'New trip' })
    expect(fab).toHaveAttribute('href', '/trips/new')
    expect(fab).toHaveClass('thumb-fab')
  })
})
