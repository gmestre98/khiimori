import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavBar } from './NavBar'

afterEach(cleanup)

function renderNavBar(props: Parameters<typeof NavBar>[0]) {
  return render(
    <MemoryRouter>
      <NavBar {...props} />
    </MemoryRouter>,
  )
}

describe('NavBar', () => {
  it('renders a banner landmark', () => {
    renderNavBar({ title: 'Trip' })
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('renders the title', () => {
    renderNavBar({ title: 'My Trip' })
    expect(screen.getByRole('heading', { name: 'My Trip' })).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    renderNavBar({ title: 'My Trip', subtitle: 'Tokyo, Kyoto' })
    expect(screen.getByText('Tokyo, Kyoto')).toBeInTheDocument()
  })

  it('omits subtitle when not provided', () => {
    renderNavBar({ title: 'My Trip' })
    expect(document.querySelector('.nav-bar-subtitle')).not.toBeInTheDocument()
  })

  it('renders back link when backTo is provided', () => {
    renderNavBar({ title: 'Trip', backTo: '/', backLabel: 'Home' })
    const link = screen.getByRole('link', { name: 'Home' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/')
  })

  it('omits back link when backTo is not provided', () => {
    renderNavBar({ title: 'Trip' })
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders actions slot when provided', () => {
    renderNavBar({ title: 'Trip', actions: <button>Edit</button> })
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })
})
