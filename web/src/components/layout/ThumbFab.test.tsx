import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ThumbFab } from './ThumbFab'

afterEach(cleanup)

describe('ThumbFab', () => {
  it('renders a link with an accessible label when given `to`', () => {
    render(
      <MemoryRouter>
        <ThumbFab to="/trips/new" label="New trip" icon="+" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'New trip' })
    expect(link).toHaveAttribute('href', '/trips/new')
  })

  it('renders a button and fires onClick when given a handler', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ThumbFab onClick={onClick} label="Quick add" icon="+" />)
    await user.click(screen.getByRole('button', { name: 'Quick add' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('hides the icon from assistive tech', () => {
    render(<ThumbFab onClick={() => {}} label="New trip" icon="+" />)
    expect(screen.getByText('+', { selector: '.thumb-fab-icon' })).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
