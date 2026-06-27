import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomNav, type BottomNavItem } from './BottomNav'

afterEach(cleanup)

const items: BottomNavItem[] = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/trips', label: 'Trips', icon: '✈️' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]

function renderBottomNav(currentPath = '/') {
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <BottomNav items={items} />
    </MemoryRouter>,
  )
}

describe('BottomNav', () => {
  it('renders a nav landmark', () => {
    renderBottomNav()
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
  })

  it('renders all items as links', () => {
    renderBottomNav()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('renders item labels', () => {
    renderBottomNav()
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Trips')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('applies active class to the current route link', () => {
    renderBottomNav('/trips')
    const tripsLink = screen.getByRole('link', { name: /Trips/ })
    expect(tripsLink).toHaveClass('bottom-nav-link--active')
  })

  it('does not apply active class to non-current links', () => {
    renderBottomNav('/trips')
    const homeLink = screen.getByRole('link', { name: /Home/ })
    expect(homeLink).not.toHaveClass('bottom-nav-link--active')
  })
})
