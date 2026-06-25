import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListSection, ListRow } from './ListSection'

afterEach(cleanup)

describe('ListSection', () => {
  it('renders children in a list', () => {
    render(
      <ListSection>
        <ListRow>Item A</ListRow>
        <ListRow>Item B</ListRow>
      </ListSection>,
    )
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('renders section title when provided', () => {
    render(
      <ListSection title="Destinations">
        <ListRow>Tokyo</ListRow>
      </ListSection>,
    )
    expect(screen.getByText('Destinations')).toBeInTheDocument()
  })

  it('omits title element when not provided', () => {
    render(
      <ListSection>
        <ListRow>Item</ListRow>
      </ListSection>,
    )
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })
})

describe('ListRow', () => {
  it('renders as a list item', () => {
    render(
      <ul>
        <ListRow>Content</ListRow>
      </ul>,
    )
    expect(screen.getByRole('listitem')).toBeInTheDocument()
  })

  it('applies selected class when selected is true', () => {
    render(
      <ul>
        <ListRow selected>Row</ListRow>
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveClass('list-row--selected')
  })

  it('renders as interactive (role=button) when onClick is provided', () => {
    render(
      <ul>
        <ListRow onClick={() => {}}>Row</ListRow>
      </ul>,
    )
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <ul>
        <ListRow onClick={onClick}>Row</ListRow>
      </ul>,
    )
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('calls onClick on Enter key', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <ul>
        <ListRow onClick={onClick}>Row</ListRow>
      </ul>,
    )
    screen.getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledOnce()
  })
})
