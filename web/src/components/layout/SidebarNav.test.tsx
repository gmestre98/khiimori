import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import { SIDEBAR_NAV_ITEMS, SIDEBAR_SECONDARY_ITEMS, buildSidebarNavItems } from './navItems'

afterEach(cleanup)

function renderNav(path = '/', items = SIDEBAR_NAV_ITEMS) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNav
        items={items}
        secondaryItems={SIDEBAR_SECONDARY_ITEMS}
        userName="Test User"
        userMeta="EUR · Lisbon"
        onSignOut={() => {}}
      />
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

  it('highlights only the most-specific destination on a nested trip route', () => {
    // On /trips/abc/budget, the parent Map/Journal links (/trips/abc) must not
    // stay highlighted alongside Budget — only Budget should be active.
    renderNav('/trips/abc/budget', buildSidebarNavItems('abc'))
    expect(screen.getByRole('link', { name: /budget/i })).toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /^map$/i })).not.toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /journal/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
    expect(screen.getByRole('link', { name: /sharing/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
  })

  it('highlights Map and Journal (shared trip day view) on the day route', () => {
    renderNav('/trips/abc/days/2026-07-02', buildSidebarNavItems('abc'))
    expect(screen.getByRole('link', { name: /^map$/i })).toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /journal/i })).toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /budget/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
  })

  it('renders the sign-out button in the user footer', () => {
    renderNav()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})
