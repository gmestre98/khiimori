import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import { PRIMARY_NAV_ITEMS } from './navItems'

afterEach(cleanup)

function renderNav(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNav items={PRIMARY_NAV_ITEMS} footer={<button>Sign out</button>} />
    </MemoryRouter>,
  )
}

describe('SidebarNav', () => {
  it('renders a Primary navigation landmark with all destinations', () => {
    renderNav()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /trips/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument()
  })

  it('marks the active destination', () => {
    renderNav('/profile')
    expect(screen.getByRole('link', { name: /profile/i })).toHaveClass('sidebar-nav-link--active')
    // Home link must not be active on a sub-route (end-matching for "/").
    expect(screen.getByRole('link', { name: /trips/i })).not.toHaveClass('sidebar-nav-link--active')
  })

  it('renders the footer slot', () => {
    renderNav()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
